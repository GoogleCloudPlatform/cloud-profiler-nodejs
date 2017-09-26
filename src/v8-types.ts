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

// Type Definitions based on implementation in bindings/

export interface CpuProfile {
  /** Time in nanoseconds at which profile was stopped. */
  endTime: number;
  topDownRoot: CpuProfileNode;
  /** Time in nanoseconds at which profile was started. */
  startTime: number;
}

export interface CpuProfileNode {
  callUid: number;
  scriptResourceName?: string;
  functionName?: string;
  lineNumber: number;
  hitCount: number;
  children: Array<CpuProfileNode>;
}

export interface AllocationProfileNode {
  name: string;
  scriptName: string;
  scriptId: number;
  lineNumber: number;
  columnNumber: number;
  allocations: Array<Allocation>;
  children: Array<AllocationProfileNode>;
}

export interface Allocation {
  size: number;
  count: number;
}
