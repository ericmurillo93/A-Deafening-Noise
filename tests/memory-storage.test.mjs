import assert from "node:assert/strict";
import { test } from "node:test";
import { clearMemoryFiles } from "../src/lib/memory-storage.js";

test("Private memory cleanup paginates and deletes only owner paths in bounded batches",async()=>{
  const removed = [];
  const folders = Array.from({length:1001},(_,index)=>({name:String(index),id:null}));
  await clearMemoryFiles({
    list:async(path,{offset,limit})=>({data:path==="owner"?folders.slice(offset,offset+limit):[{name:"photo",id:"file"}],error:null}),
    remove:async(paths)=>{assert.ok(paths.length<=100);removed.push(...paths);return {error:null};},
  },"owner");
  assert.equal(removed.length,1001);
  assert.equal(new Set(removed).size,1001);
  assert.ok(removed.every(path=>/^owner\/[0-9]+\/photo$/.test(path)));
});
test("Storage cleanup failures propagate so account deletion can stop safely",async()=>{
  await assert.rejects(()=>clearMemoryFiles({list:async()=>({error:new Error("Unavailable")})},"owner"),/Unavailable/);
  await assert.rejects(()=>clearMemoryFiles({list:async()=>({data:[{name:"photo",id:"file"}],error:null}),remove:async()=>({error:new Error("Delete failed")})},"owner"),/Delete failed/);
});
