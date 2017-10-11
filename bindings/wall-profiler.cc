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

#include "v8-profiler.h"
#include "nan.h"

using namespace v8;

Local<Value> TranslateWallProfileNode(const CpuProfileNode* node) {
  // TODO: Implement unimplemented interface
  Local<Object> js_node = Nan::New<Object>();
  js_node->Set(Nan::New<String>("functionName").ToLocalChecked(),
    node->GetFunctionName());
  js_node->Set(Nan::New<String>("scriptResourceName").ToLocalChecked(),
    node->GetScriptResourceName());
  js_node->Set(Nan::New<String>("lineNumber").ToLocalChecked(),
    Nan::New<Integer>(node->GetLineNumber()));
  js_node->Set(Nan::New<String>("hitCount").ToLocalChecked(),
    Nan::New<Integer>(node->GetHitCount()));
  js_node->Set(Nan::New<String>("callUid").ToLocalChecked(),
    Nan::New<Integer>(node->GetCallUid()));
  int32_t count = node->GetChildrenCount();
  Local<Array> children = Nan::New<Array>(count);
  for (int32_t i = 0; i < count; i++) {
    children->Set(i, TranslateWallProfileNode(node->GetChild(i)));
  }
  js_node->Set(Nan::New<String>("children").ToLocalChecked(),
    children);
  return js_node;
}

Local<Value> TranslateWallProfile(const CpuProfile* profile) {
  // TODO: Implement unimplemented interface
  Local<Object> js_profile = Nan::New<Object>();
  js_profile->Set(Nan::New<String>("title").ToLocalChecked(),
    profile->GetTitle());
  js_profile->Set(Nan::New<String>("topDownRoot").ToLocalChecked(),
    TranslateWallProfileNode(profile->GetTopDownRoot()));
  js_profile->Set(Nan::New<String>("samplesCount").ToLocalChecked(),
    Nan::New<Integer>(profile->GetSamplesCount()));
  js_profile->Set(Nan::New<String>("startTime").ToLocalChecked(),
    Nan::New<Number>(profile->GetStartTime()));
  js_profile->Set(Nan::New<String>("endTime").ToLocalChecked(),
    Nan::New<Number>(profile->GetEndTime()));
  return js_profile;
}

NAN_METHOD(StartProfiling) {
  Local<String> name = info[0].As<String>();
  bool record_samples = info[1].As<Boolean>()->BooleanValue();
  info.GetIsolate()->GetCpuProfiler()->StartProfiling(name, record_samples);
}

NAN_METHOD(StopProfiling) {
  Local<String> name = info[0].As<String>();
  CpuProfile* profile =
    info.GetIsolate()->GetCpuProfiler()->StopProfiling(name);
  Local<Value> translated_profile = TranslateWallProfile(profile);
  profile->Delete();
  info.GetReturnValue().Set(translated_profile);
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
    Nan::GetFunction(Nan::New<FunctionTemplate>(StartProfiling)).ToLocalChecked());
  Nan::Set(target, Nan::New("stopProfiling").ToLocalChecked(),
    Nan::GetFunction(Nan::New<FunctionTemplate>(StopProfiling)).ToLocalChecked());
  Nan::Set(target, Nan::New("setSamplingInterval").ToLocalChecked(),
    Nan::GetFunction(Nan::New<FunctionTemplate>(SetSamplingInterval)).ToLocalChecked());
  Nan::Set(target, Nan::New("setIdle").ToLocalChecked(),
    Nan::GetFunction(Nan::New<FunctionTemplate>(SetIdle)).ToLocalChecked());
}

NODE_MODULE(wall_profiler, InitAll);
