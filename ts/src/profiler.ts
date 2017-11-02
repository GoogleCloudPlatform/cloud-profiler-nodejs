/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as delay from 'delay';
import * as http from 'http';
import * as path from 'path';
import * as pify from 'pify';
import * as zlib from 'zlib';

import {perftools} from '../../proto/profile';
import {AuthenticationConfig, Common, Logger, Service, ServiceConfig, ServiceObject, ServiceObjectConfig} from '../third_party/types/common-types';

import {ProfilerConfig} from './config';
import {HeapProfiler} from './profilers/heap-profiler';
import {TimeProfiler} from './profilers/time-profiler';

export const common: Common = require('@google-cloud/common');
const pjson = require('../../package.json');
const API = 'https://cloudprofiler.googleapis.com/v2';
const gzip = pify(zlib.gzip);

enum ProfileTypes {
  Wall = 'WALL',
  Heap = 'HEAP'
}

/**
 * Returns true if http status code indicates an error.
 */
function isErrorResponseCode(code: number) {
  return code < 200 || code >= 300;
}

/**
 * Returns true if http status code indicates request should be retried.
 */
function isRetriableResponseCode(code: number) {
  // TODO: determine which codes one should not retry on.
  return true;
}

/**
 * Returns true if error indicates that request should be retried.
 */
function isRetriableError(err: Error) {
  // TODO: determine which errors one should not retry on.
  return true;
}

/**
 * Interface for body of response from Stackdriver Profiler API when creating
 * profile and used as body of request to Stackdriver Profiler API when
 * uploading a profile.
 *
 * Public for testing.
 */
export interface RequestProfile {
  name?: string;
  profileType?: string;
  duration?: any;
  profileBytes?: string;
  labels?: {instance?: string; zone?: string};
}

/**
 * Converts a profile to a compressed, base64 encoded string.
 *
 * @param p - profile to be converted to string.
 */
async function profileBytes(p: perftools.profiles.IProfile): Promise<string> {
  const pwriter = perftools.profiles.Profile.encode(p);
  const buffer = new Buffer(pwriter.finish());
  const gzBuf = await gzip(buffer);
  return gzBuf.toString('base64');
}

/**
 * Polls Stackdriver Profiler server for instructions on behalf of a task and
 * collects and uploads profiles as requested
 */
export class Profiler extends common.ServiceObject {
  private config: ProfilerConfig;
  private logger: Logger;
  private profileTypes: string[];

  // Public for testing.
  timeProfiler: TimeProfiler|undefined;
  heapProfiler: HeapProfiler|undefined;

  constructor(config: ProfilerConfig) {
    config = common.util.normalizeArguments(null, config);
    const serviceConfig = {
      baseUrl: API,
      scopes: ['https://www.googleapis.com/auth/monitoring.write'],
      packageJson: pjson,
    };
    super({parent: new common.Service(serviceConfig, config), baseUrl: '/'});

    this.config = config;

    this.logger = new common.logger({
      level: common.logger.LEVELS[config.logLevel as number],
      tag: pjson.name
    });

    // TODO: enable heap profiling once heap profiler implemented.
    this.profileTypes = [];
    if (!this.config.disableTime) {
      this.profileTypes.push(ProfileTypes.Wall);
      this.timeProfiler = new TimeProfiler(this.config.timeIntervalMicros);
    }
    if (!this.config.disableHeap) {
      this.profileTypes.push(ProfileTypes.Heap);
      this.heapProfiler = new HeapProfiler(
          this.config.heapIntervalBytes, this.config.heapMaxStackDepth);
    }
  }

  /**
   * Starts and endless loop to poll Stackdriver Profiler server for
   * instructions, and collects and uploads profiles as requested.
   * If there is a problem when collecting a profile or uploading a profile to
   * Stackdriver Profiler, this problem will be logged at the debug level.
   * If there is a problem polling Stackdriver Profiler for instructions
   * on the type of profile created, this problem will be logged. If the problem
   * indicates one definitely will not be able to profile, an error will be
   * thrown.
   */
  async start(): Promise<void> {
    return this.pollProfilerService();
  }

  /**
   * Endlessly polls the profiler server for instructions, and collects and
   * uploads profiles as requested.
   */
  async pollProfilerService(): Promise<void> {
    const startCreateMillis = Date.now();
    const prof = await this.createProfile();
    await this.profileAndUpload(prof);
    const endCreateMillis = Date.now();

    // Schedule the next profile.
    setImmediate(this.pollProfilerService.bind(this)).unref();
  }

  /**
   * Talks to Stackdriver Profiler server, which hangs until server indicates
   * job should be profiled.
   *
   * If any problem is encountered, the problem will be logged and
   * createProfile() will be retried.
   *
   * TODO: implement backoff and retry when error encountered. createProfile()
   * should be retried at time response indicates this request should be retried
   * or with exponential backoff (up to one hour) if the response does not
   * indicate when to retry this request. Once this is implemented, an error
   * will be thrown only if the error indicates one definitely should not
   * retry createProfile.
   *
   * Public to allow for testing.
   */
  async createProfile(): Promise<RequestProfile> {
    const reqBody = {
      deployment: {
        projectId: this.config.projectId,
        target: this.config.serviceContext.service,
        labels: {zone: this.config.zone, instance: this.config.instance},
      },
      profileType: this.profileTypes,
    };
    const options = {
      method: 'POST',
      uri: '/profiles',
      body: reqBody,
      json: true,
    };

    let requestError: Error|undefined = undefined;
    let retryRequest = true;
    try {
      const [body, response] = await this.request(options);
      if (isErrorResponseCode(response.statusCode)) {
        retryRequest = isRetriableResponseCode(response.statusCode);
        requestError =
            new Error('Error creating profile: ' + response.statusMessage);
        this.logger.debug(requestError);
      } else {
        return body;
      }
    } catch (err) {
      retryRequest =
          isRetriableError(err) || isRetriableResponseCode(err.statusCode);
      requestError = new Error('Error creating profile: ' + err.toString());
      this.logger.debug(requestError);
    }
    if (retryRequest) {
      // TODO: check response to see if response specifies a backoff.
      // TODO: implement exponential backoff.
      await delay(this.config.backoffMillis);
      return this.createProfile();
    }
    throw requestError;
  }

  /**
   * Collects a profile of the type specified by the profileType field of prof.
   * If any problem is encountered, like a problem collecting or uploading the
   * profile, an error will be logged at the debug level, but otherwise ignored.
   *
   * Public to allow for testing.
   *
   * @param prof
   */
  async profileAndUpload(prof: RequestProfile): Promise<void> {
    try {
      prof = await this.profile(prof);
    } catch (err) {
      this.logger.debug('Error collecting profile: ' + err.toString());
      return;
    }
    const options = {
      method: 'PATCH',
      uri: API + '/' + prof.name,
      body: prof,
      json: true,
    };
    try {
      const [body, response] = await this.request(options);
      if (isErrorResponseCode(response.statusCode)) {
        this.logger.debug('Error uploading profile: ' + response.statusMessage);
      }
    } catch (err) {
      this.logger.debug('Error uploading profile: ' + err.toString());
    }
  }

  /**
   * Collects a profile of the type specified by the profileType field of prof.
   * If any problem is encountered, for example the profileType is not
   * recognized or profiling is disabled for the specified profileType, an
   * error will be thrown.
   *
   * Public to allow for testing.
   *
   * @param prof
   */
  async profile(prof: RequestProfile): Promise<RequestProfile> {
    switch (prof.profileType) {
      case ProfileTypes.Wall:
        return await this.writeTimeProfile(prof);
      case ProfileTypes.Heap:
        return this.writeHeapProfile(prof);
      default:
        throw new Error('Unexpected profile type ' + prof.profileType + '.');
    }
  }

  /**
   * Collects a time profile, converts profile to compressed, base64 encoded
   * string, and adds profileBytes field to prof with this string.
   *
   * Public to allow for testing.
   *
   * @param prof
   */
  async writeTimeProfile(prof: RequestProfile): Promise<RequestProfile> {
    if (this.timeProfiler) {
      // TODO: determine time from request profile.
      const durationMillis = 10 * 1000;  // 10 seconds
      const p = await this.timeProfiler.profile(durationMillis);
      prof.profileBytes = await profileBytes(p);
      return prof;
    }
    throw Error('Cannot collect time profile, time profiler not enabled.');
  }

  /**
   * Collects a time profile, converts profile to compressed, base64 encoded
   * string, and adds profileBytes field to prof with this string.
   *
   * Public to allow for testing.
   *
   * @param prof
   */
  async writeHeapProfile(prof: RequestProfile): Promise<RequestProfile> {
    if (this.heapProfiler) {
      const p = this.heapProfiler.profile();
      prof.profileBytes = await profileBytes(p);
      return prof;
    }
    throw Error('Cannot collect heap profile, heap profiler not enabled.');
  }
}
