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

import * as extend from 'extend';
import * as gcpMetadata from 'gcp-metadata';
import * as path from 'path';
import * as pify from 'pify';
import {AuthenticationConfig, Common, ServiceConfig} from '../third_party/types/common-types';
import {Config, defaultConfig, internalConfig, ProfilerConfig} from './config';
import {Profiler} from './profiler';

const common: Common = require('@google-cloud/common');

// Returns value of metadata instance field.
// Throws error if there is a problem accessing metadata API.
async function getMetadataInstanceField(field: string): Promise<string> {
  const [response, metadata] =
      await pify(gcpMetadata.instance, {multiArgs: true})(field);
  return metadata;
}

// Returns value of metadata project field.
// Throws error if there is a problem accessing metadata API.
async function getMetadataProjectField(field: string): Promise<string> {
  const [response, metadata] =
      await pify(gcpMetadata.project, {multiArgs: true})(field);
  return metadata;
}

// initConfig sets unset values in the configuration to the value retrieved from
// environment variables, metadata, or the default values specified in
// defaultConfig.
// Throws error if value that must be set cannot be initialized.
// Exported for testing purposes.
export async function initConfig(config: Config): Promise<ProfilerConfig> {
  config = common.util.normalizeArguments(null, config);

  const envConfig: Config = {
    projectId: process.env.GCLOUD_PROJECT,
    serviceContext: {
      service: process.env.GAE_SERVICE,
      version: process.env.GAE_VERSION,
    }
  };

  if (process.env.GCLOUD_PROFILER_LOGLEVEL !== undefined) {
    let envLogLevel = parseInt(process.env.GCLOUD_PROFILER_LOGLEVEL || '', 10);
    if (envLogLevel !== NaN) {
      envConfig.logLevel = envLogLevel;
    }
  }

  let envSetConfig: Config = {};
  if (process.env.hasOwnProperty('GCLOUD_PROFILER_CONFIG')) {
    envSetConfig =
        require(path.resolve(process.env.GCLOUD_PROFILER_CONFIG)) as Config;
  }

  let mergedConfig = extend(
      true, {}, defaultConfig, envSetConfig, envConfig, config, internalConfig);

  if (!mergedConfig.zone || !mergedConfig.instance) {
    const [instance, zone, projectId] =
        await Promise
            .all([
              getMetadataInstanceField('name'),
              getMetadataInstanceField('zone'),
              getMetadataProjectField('projectId')
            ])
            .catch(
                (err: Error) => {
                    // ignore errors, which will occur when not on GCE.
                }) ||
        ['', '', undefined];
    if (!mergedConfig.zone) {
      mergedConfig.zone = zone.substring(zone.lastIndexOf('/') + 1);
    }
    if (!mergedConfig.instance) {
      mergedConfig.instance = instance;
    }
    if (!mergedConfig.projectId) {
      mergedConfig.projectId = projectId;
    }
  }

  if (mergedConfig.serviceContext.service === undefined) {
    throw new Error('Service must be specified in the configuration.');
  }

  if (mergedConfig.projectId === undefined) {
    throw new Error(
        'ProjectId must be specified in the configuration when running outside of GCP.');
  }

  return mergedConfig;
}

let profiler: Profiler|undefined = undefined;

/**
 * Starts the profiling agent and returns a promise.
 * If any error is encountered when profiling, the promise will be rejected.
 *
 * config - Config describing configuration for profiling.
 *
 * @example
 * profiler.start();
 *
 * @example
 * profiler.start(config);
 *
 */
export async function start(config: Config = {}): Promise<void> {
  const normalizedConfig = await initConfig(config);
  profiler = new Profiler(normalizedConfig);
  return profiler.start();
}

// If the module was --require'd from the command line, start the agent.
if (module.parent && module.parent.id === 'internal/preload') {
  start();
}
