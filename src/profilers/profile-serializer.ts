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

import {perftools} from '../profile';
import {AllocationProfileNode, ProfileNode, TimeProfile, TimeProfileNode} from '../v8-types';

// A stack of function IDs.
type Stack = Array<number>;

// A function which converts entry into one or more samples, then
// appends those sample(s) to samples.
type AppendEntryToSamples =
    (entry: Entry, samples: perftools.profiles.Sample[]) => void;

// Profile node and stack trace to that node.
interface Entry {
  node: ProfileNode;
  stack: Stack;
}

// Heap profile node and stack trace to that node.
interface AllocationEntry {
  node: AllocationProfileNode;
  stack: Stack;
}

// Time profile node and stack trace to that node.
interface TimeEntry {
  node: TimeProfileNode;
  stack: Stack;
}

/**
 * Used to build string table and access strings and their ids within the table
 * when serializing a profile.
 */
class StringTable {
  strings: string[];
  stringsMap: Map<string, number>;

  constructor() {
    this.strings = [];
    this.stringsMap = new Map<string, number>();
    this.getIndexOrAdd('');
  }

  /**
   * Returns index of str within the table. Also adds str to string table if
   * str is not in the table already.
   */
  getIndexOrAdd(str: string): number {
    let loc = this.stringsMap.get(str);
    if (loc !== undefined) {
      return loc;
    }
    loc = this.strings.push(str) - 1;
    this.stringsMap.set(str, loc);
    return loc;
  }
}

/**
 * Takes v8 profile and populates sample, location, and function fields of
 * profile.proto.
 *
 * @param profile - profile.proto with empty sample, location, and function
 * fields.
 * @param root - root of v8 profile tree describing samples to be appended
 * to profile.
 * @param appendToSamples - function which converts entry to sample(s)  and
 * appends these to end of an array of samples.
 * @param stringTable - string table for the existing profile.
 */
function serialize(
    profile: perftools.profiles.IProfile, root: ProfileNode,
    appendToSamples: AppendEntryToSamples, stringTable: StringTable) {
  const samples: Array<perftools.profiles.Sample> = [];
  const locations: Array<perftools.profiles.Location> = [];
  const functions: Array<perftools.profiles.Function> = [];
  const locationMap: Map<number, perftools.profiles.Location> = new Map();
  const functionMap: Map<number, perftools.profiles.Function> = new Map();
  const functionIdMap = new Map<string, number>();
  const locationIdMap = new Map<string, number>();

  const entries: Entry[] = root.children.map((n) => ({node: n, stack: []}));
  while (entries.length > 0) {
    const entry = entries.pop();
    if (entry !== undefined) {
      const node = entry.node;
      const stack = entry.stack;
      const location = getLocation(node);
      stack.unshift(location.id as number);
      appendToSamples(entry, samples);
      for (let child of node.children) {
        entries.push({node: child, stack: stack.slice()});
      }
    }
  }

  profile.sample = samples;
  profile.location = locations;
  profile.function = functions;
  profile.stringTable = stringTable.strings;

  function getLocation(node: ProfileNode): perftools.profiles.Location {
    const keyStr =
        `${node.scriptId}:${node.lineNumber}:${node.columnNumber}:${node.name}`;
    let id = locationIdMap.get(keyStr);
    if (id !== undefined) {
      // id is index+1, since 0 is not valid id.
      return locations[id - 1];
    }
    id = locations.length + 1;
    locationIdMap.set(keyStr, id);
    const location =
        new perftools.profiles.Location({id: id, line: [getLine(node)]});
    locations.push(location);
    return location;
  }

  function getLine(node: ProfileNode): perftools.profiles.Line {
    return new perftools.profiles.Line({
      functionId: getFunction(node).id,
      line: node.lineNumber,
    });
  }

  function getFunction(node: ProfileNode): perftools.profiles.Function {
    const keyStr = `${node.scriptId}:${node.name}`;
    let id = functionIdMap.get(keyStr);
    if (id !== undefined) {
      // id is index+1, since 0 is not valid id.
      return functions[id - 1];
    }
    id = functions.length + 1;
    functionIdMap.set(keyStr, id);
    let nameId = stringTable.getIndexOrAdd(node.name);
    let f = new perftools.profiles.Function({
      id: id,
      name: nameId,
      systemName: nameId,
      filename: stringTable.getIndexOrAdd(node.scriptName)
    });
    functions.push(f);
    return f;
  }
}

/**
 * Returns value type for samples counts (type:samples, units:count), and
 * adds strings used in this value type to the table.
 */
function createSampleValueType(table: StringTable):
    perftools.profiles.ValueType {
  return new perftools.profiles.ValueType({
    type: table.getIndexOrAdd('samples'),
    unit: table.getIndexOrAdd('count')
  });
}

/**
 * Returns value type for time samples (type:time, units:microseconds), and
 * adds strings used in this value type to the table.
 */
function createTimeValueType(table: StringTable): perftools.profiles.ValueType {
  return new perftools.profiles.ValueType({
    type: table.getIndexOrAdd('time'),
    unit: table.getIndexOrAdd('microseconds')
  });
}

/**
 * Returns value type for memory allocations (type:space, units:bytes), and
 * adds strings used in this value type to the table.
 */
function createAllocationValueType(table: StringTable):
    perftools.profiles.ValueType {
  return new perftools.profiles.ValueType(
      {type: table.getIndexOrAdd('space'), unit: table.getIndexOrAdd('bytes')});
}

/**
 * Converts v8 time profile into into a profile proto.
 * (https://github.com/google/pprof/blob/master/proto/profile.proto)
 *
 * @param prof - profile to be converted.
 * @param intervalMicros - average time (microseconds) between samples.
 */
export function serializeTimeProfile(
    prof: TimeProfile, intervalMicros: number): perftools.profiles.IProfile {
  const appendTimeEntryToSamples: AppendEntryToSamples =
      (entry: TimeEntry, samples: perftools.profiles.Sample[]) => {
        if (entry.node.hitCount > 0) {
          const sample = new perftools.profiles.Sample({
            locationId: entry.stack,
            value:
                [entry.node.hitCount, entry.node.hitCount * intervalMicros]
          });
          samples.push(sample);
        }
      };

  const stringTable = new StringTable();
  const sampleValueType = createSampleValueType(stringTable);
  const timeValueType = createTimeValueType(stringTable);

  const profile = {
    sampleType: [sampleValueType, timeValueType],
    timeNanos: prof.startTime * 1000 * 1000,
    durationNanos: (prof.endTime - prof.startTime) * 1000 * 1000,
    periodType: timeValueType,
    period: intervalMicros,
  };

  serialize(profile, prof.topDownRoot, appendTimeEntryToSamples, stringTable);

  return profile;
}

/**
 * Converts v8 heap profile into into a profile proto.
 * (https://github.com/google/pprof/blob/master/proto/profile.proto)
 *
 * @param prof - profile to be converted.
 * @param startTimeNanos - start time of profile, in nanoseconds (POSIX time).
 * @param durationsNanos - duration of the profile (wall clock time) in
 * nanoseconds.
 * @param intervalBytes - bytes allocated between samples.
 */
export function serializeHeapProfile(
    prof: AllocationProfileNode, startTimeNanos: number, durationNanos: number,
    intervalBytes: number): perftools.profiles.IProfile {
  const appendHeapEntryToSamples: AppendEntryToSamples =
      (entry: AllocationEntry, samples: perftools.profiles.Sample[]) => {
        if (entry.node.allocations.length > 0) {
          for (const alloc of entry.node.allocations) {
            const sample = new perftools.profiles.Sample({
              locationId: entry.stack,
              value: [alloc.count, alloc.sizeBytes * alloc.count]
              // TODO: add tag for allocation size
            });
            samples.push(sample);
          }
        }
      };

  const stringTable = new StringTable();
  const sampleValueType = createSampleValueType(stringTable);
  const allocationValueType = createAllocationValueType(stringTable);

  const profile = {
    sampleType: [sampleValueType, allocationValueType],
    timeNanos: startTimeNanos,
    durationNanos: durationNanos,
    periodType: allocationValueType,
    period: intervalBytes,
  };

  serialize(profile, prof, appendHeapEntryToSamples, stringTable);
  return profile;
}
