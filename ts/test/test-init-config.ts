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

import * as assert from 'assert';
import * as gcpMetadata from 'gcp-metadata';
import * as sinon from 'sinon';

import {initConfig} from '../src/index';

describe('initConfig', () => {
  let savedEnv: NodeJS.ProcessEnv;

  before(() => {
    savedEnv = process.env;
  });

  beforeEach(() => {
    process.env = {};
  });

  afterEach(() => {
    (gcpMetadata.instance as any).restore();
  });

  after(() => {
    process.env = savedEnv;
  });

  it('should not modify specified fields when not on GCE', async () => {
    sinon.stub(gcpMetadata, 'instance')
        .throwsException('cannot access metadata');

    const config = {
      logLevel: 2,
      serviceContext: {version: 'fake-version', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone',
      projectId: 'fake-projectId'
    };
    const expConfig = {
      logLevel: 2,
      serviceContext: {version: 'fake-version', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone',
      projectId: 'fake-projectId',
      minProfilingIntervalMillis: 60 * 1000,
      timeSamplingIntervalMicros: 1000,
      backoffMillis: 1000
    };
    let initializedConfig = await initConfig(config);
    assert.deepEqual(initializedConfig, expConfig);
  });

  it('should not modify specified fields when on GCE', async () => {
    sinon.stub(gcpMetadata, 'instance')
        .withArgs('name')
        .callsArgWith(1, null, undefined, 'gce-instance')
        .withArgs('zone')
        .callsArgWith(
            1, null, undefined, 'projects/123456789012/zones/gce-zone');

    const config = {
      logLevel: 2,
      serviceContext: {version: 'fake-version', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone',
      projectId: 'fake-projectId'
    };
    const expConfig = {
      logLevel: 2,
      serviceContext: {version: 'fake-version', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone',
      projectId: 'fake-projectId',
      minProfilingIntervalMillis: 60 * 1000,
      timeSamplingIntervalMicros: 1000,
      backoffMillis: 1000
    };
    let initializedConfig = await initConfig(config);
    assert.deepEqual(initializedConfig, expConfig);
  });

  it('should get zone and instance from GCE', async () => {
    sinon.stub(gcpMetadata, 'instance')
        .withArgs('name')
        .callsArgWith(1, null, undefined, 'gce-instance')
        .withArgs('zone')
        .callsArgWith(
            1, null, undefined, 'projects/123456789012/zones/gce-zone');

    const config = {
      projectId: 'projectId',
      logLevel: 2,
      serviceContext: {version: '', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
    };
    const expConfig = {
      logLevel: 2,
      serviceContext: {version: '', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'gce-instance',
      zone: 'gce-zone',
      projectId: 'projectId',
      minProfilingIntervalMillis: 60 * 1000,
      timeSamplingIntervalMicros: 1000,
      backoffMillis: 1000
    };
    let initializedConfig = await initConfig(config);
    assert.deepEqual(initializedConfig, expConfig);
  });

  it('should not reject when not on GCE and no zone and instance found',
     async () => {
       sinon.stub(gcpMetadata, 'instance')
           .throwsException('cannot access metadata');
       const config = {
         projectId: 'fake-projectId',
         serviceContext: {service: 'fake-service'}
       };
       const expConfig = {
         logLevel: 1,
         serviceContext: {service: 'fake-service'},
         disableHeap: false,
         disableTime: false,
         instance: '',
         zone: '',
         projectId: 'fake-projectId',
         minProfilingIntervalMillis: 60 * 1000,
         timeSamplingIntervalMicros: 1000,
         backoffMillis: 1000
       };
       let initializedConfig = await initConfig(config);
       assert.deepEqual(initializedConfig, expConfig);
     });

  it('should reject when no service specified', () => {
    sinon.stub(gcpMetadata, 'instance')
        .throwsException('cannot access metadata');
    const config = {
      logLevel: 2,
      serviceContext: {version: ''},
      disableHeap: true,
      disableTime: true,
    };
    return initConfig(config)
        .then(initializedConfig => {
          assert.fail('expected error because no service in config');
        })
        .catch((e: Error) => {
          assert.equal(
              e.message, 'Service must be specified in the configuration.');
        });
  });

  it('should get have no projectId when no projectId given', async () => {
    sinon.stub(gcpMetadata, 'instance')
        .throwsException('cannot access metadata');

    const config = {
      logLevel: 2,
      serviceContext: {version: '', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone'
    };
    const expConfig = {
      logLevel: 2,
      serviceContext: {version: '', service: 'fake-service'},
      disableHeap: true,
      disableTime: true,
      instance: 'instance',
      zone: 'zone',
      minProfilingIntervalMillis: 60 * 1000,
      timeSamplingIntervalMicros: 1000,
      backoffMillis: 1000
    };
    let initializedConfig = await initConfig(config);
    assert.deepEqual(initializedConfig, expConfig);
  });

  it('should get values from from environment variable when not specified in config or environment variables',
     async () => {
       process.env.GCLOUD_PROJECT = 'process-projectId';
       process.env.GCLOUD_PROFILER_LOGLEVEL = '4';
       process.env.GAE_SERVICE = 'process-service';
       process.env.GAE_VERSION = 'process-version';
       process.env.GCLOUD_PROFILER_CONFIG =
           './ts/test/fixtures/test-config.json';
       sinon.stub(gcpMetadata, 'instance')
           .withArgs('name')
           .callsArgWith(1, null, undefined, 'gce-instance')
           .withArgs('zone')
           .callsArgWith(
               1, null, undefined, 'projects/123456789012/zones/gce-zone');
       const config = {};
       const expConfig = {
         projectId: 'process-projectId',
         logLevel: 4,
         serviceContext:
             {version: 'process-version', service: 'process-service'},
         disableHeap: true,
         disableTime: true,
         instance: 'envConfig-instance',
         zone: 'envConfig-zone',
         minProfilingIntervalMillis: 60 * 1000,
         timeSamplingIntervalMicros: 1000,
         backoffMillis: 1000
       };
       let initializedConfig = await initConfig(config);
       assert.deepEqual(initializedConfig, expConfig);
     });

  it('should not get values from from environment variable when values specified in config',
     async () => {
       process.env.GCLOUD_PROJECT = 'process-projectId';
       process.env.GCLOUD_PROFILER_LOGLEVEL = '4';
       process.env.GAE_SERVICE = 'process-service';
       process.env.GAE_VERSION = 'process-version';
       process.env.GCLOUD_PROFILER_CONFIG =
           './ts/test/fixtures/test-config.json';
       sinon.stub(gcpMetadata, 'instance')
           .withArgs('name')
           .callsArgWith(1, null, undefined, 'gce-instance')
           .withArgs('zone')
           .callsArgWith(
               1, null, undefined, 'projects/123456789012/zones/gce-zone');

       const config = {
         projectId: 'config-projectId',
         logLevel: 1,
         serviceContext: {version: 'config-version', service: 'config-service'},
         disableHeap: false,
         disableTime: false,
         instance: 'instance',
         zone: 'zone'
       };
       const expConfig = {
         projectId: 'config-projectId',
         logLevel: 1,
         serviceContext: {version: 'config-version', service: 'config-service'},
         disableHeap: false,
         disableTime: false,
         instance: 'instance',
         zone: 'zone',
         minProfilingIntervalMillis: 60 * 1000,
         timeSamplingIntervalMicros: 1000,
         backoffMillis: 1000
       };
       let initializedConfig = await initConfig(config);
       assert.deepEqual(initializedConfig, expConfig);
     });

  it('should get values from from environment config when not specified in config or other environment variables',
     async () => {
       sinon.stub(gcpMetadata, 'instance')
           .throwsException('cannot access metadata');
       process.env.GCLOUD_PROFILER_CONFIG =
           './ts/test/fixtures/test-config.json';

       const expConfig = {
         logLevel: 3,
         serviceContext:
             {version: 'envConfig-version', service: 'envConfig-service'},
         disableHeap: true,
         disableTime: true,
         instance: 'envConfig-instance',
         zone: 'envConfig-zone',
         projectId: 'envConfig-fake-projectId',
         minProfilingIntervalMillis: 60 * 1000,
         timeSamplingIntervalMicros: 1000,
         backoffMillis: 1000
       };

       const config = {};
       let initializedConfig = await initConfig(config);
       assert.deepEqual(initializedConfig, expConfig);
     });
});
