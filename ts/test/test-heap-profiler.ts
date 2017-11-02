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
import * as sinon from 'sinon';

import {perftools} from '../../proto/profile';
import {HeapProfiler} from '../src/profilers/heap-profiler';

import {heapProfile, v8HeapProfile} from './profiles-for-tests';

let assert = require('assert');
const v8HeapProfiler = require('bindings')('sampling_heap_profiler');

describe('HeapProfiler', () => {
  describe('profile', () => {
    before(() => {
      sinon.stub(v8HeapProfiler, 'startSamplingHeapProfiler');
      sinon.stub(v8HeapProfiler, 'stopSamplingHeapProfiler');
      sinon.stub(v8HeapProfiler, 'getAllocationProfile').returns(v8HeapProfile);
      sinon.stub(Date, 'now').returns(0);
    });

    after(() => {
      v8HeapProfiler.startSamplingHeapProfiler.restore();
      v8HeapProfiler.stopSamplingHeapProfiler.restore();
      v8HeapProfiler.getAllocationProfile.restore();
      (Date.now as any).restore();
    });

    it('should return a profile equal to the expected profile', async () => {
      const durationMillis = 10 * 1000;
      const intervalBytes = 1024 * 512;
      const stackDepth = 32;
      let profiler = new HeapProfiler(intervalBytes, stackDepth);
      let profile = profiler.profile();
      assert.deepEqual(heapProfile, profile);
    });

    it('should throw error when disabled', async () => {
      const durationMillis = 10 * 1000;
      const intervalBytes = 1024 * 512;
      const stackDepth = 32;
      const profiler = new HeapProfiler(intervalBytes, stackDepth);
      profiler.disable();
      try {
        const profile = await profiler.profile();
        assert.fail('Expected error to be thrown.');
      } catch (err) {
        assert.equal(err.message, 'Heap profiler is not enabled.');
      }
    });
  });
});
