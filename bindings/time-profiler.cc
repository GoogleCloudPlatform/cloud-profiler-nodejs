/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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

#include "nan.h"
#include "serialize-v8.h"
#include "v8-profiler.h"

using namespace v8;

NAN_METHOD(StartProfiling) {
  Local<String> name = info[0].As<String>();

  // Sample counts and timestamps are not used, so we do not need to record
  // samples.
  info.GetIsolate()->GetCpuProfiler()->StartProfiling(name, false);
}

void free_buffer_callback(char* data, void* buf) {
  delete reinterpret_cast<std::vector<char>*>(buf);
}

NAN_METHOD(StopProfiling) {
  Local<String> name = info[0].As<String>();
  int64_t samplingIntervalMicros = info[1].As<Integer>()->IntegerValue();
  int64_t startTimeNanos = info[2].As<Integer>()->IntegerValue();
  CpuProfile* profile =
      info.GetIsolate()->GetCpuProfiler()->StopProfiling(name);
  std::unique_ptr<std::vector<char>> buffer =
      serializeTimeProfile(profile, samplingIntervalMicros, startTimeNanos);
  profile->Delete();
  std::vector<char>* buf = buffer.release();
  info.GetReturnValue().Set(
      Nan::NewBuffer(&buf->at(0), buf->size(), free_buffer_callback, buf)
          .ToLocalChecked());
}

NAN_METHOD(SetSamplingInterval) {
  int us = info[0].As<Integer>()->IntegerValue();
  info.GetIsolate()->GetCpuProfiler()->SetSamplingInterval(us);
}

NAN_METHOD(SetIdle) {
  bool is_idle = info[0].As<Boolean>()->BooleanValue();
  info.GetIsolate()->GetCpuProfiler()->SetIdle(is_idle);
}

NAN_MODULE_INIT(InitAll) {
  Nan::Set(target, Nan::New("startProfiling").ToLocalChecked(),
           Nan::GetFunction(Nan::New<FunctionTemplate>(StartProfiling))
               .ToLocalChecked());
  Nan::Set(target, Nan::New("stopProfiling").ToLocalChecked(),
           Nan::GetFunction(Nan::New<FunctionTemplate>(StopProfiling))
               .ToLocalChecked());
  Nan::Set(target, Nan::New("setSamplingInterval").ToLocalChecked(),
           Nan::GetFunction(Nan::New<FunctionTemplate>(SetSamplingInterval))
               .ToLocalChecked());
  Nan::Set(
      target, Nan::New("setIdle").ToLocalChecked(),
      Nan::GetFunction(Nan::New<FunctionTemplate>(SetIdle)).ToLocalChecked());
}

NODE_MODULE(time_profiler, InitAll);
