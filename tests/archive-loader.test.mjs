import assert from "node:assert/strict";
import { loadArchiveSnapshot } from "../src/lib/archive-loader.js";
const core={profile:{id:"a"},concerts:[{artist:"TEST"}]};
let painted=false;
const result=await loadArchiveSnapshot(async(name)=>{
  if(name==="get_my_archive_snapshot") return core;
  assert(painted);throw new Error("Spotify unavailable");
},{previous:{suggestions:[{id:"cached"}]},onArchive:()=>{painted=true;}});
assert.equal(result.concerts[0].artist,"TEST");assert.equal(result.suggestions[0].id,"cached");assert(result.discoveryUnavailable);
let calls=0;await loadArchiveSnapshot(async()=>{calls++;return core;},{includeDiscovery:false});assert.equal(calls,1);
await assert.rejects(loadArchiveSnapshot(async()=>{throw new Error("Forbidden");}));
