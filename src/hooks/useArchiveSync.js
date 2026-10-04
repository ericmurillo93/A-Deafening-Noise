import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseEnabled, loadConcertData } from "../lib/supabase";
import { clearAppCache, readAppCache, writeAppCache } from "../lib/app-cache";

export function useArchiveSync(userId, onData, onTheme) {
  const [state,setState]=useState({dataReady:!supabaseEnabled,dataOwnerId:"",dataLoadError:"",syncError:"",isRefreshing:false});
  const owner=useRef(userId); owner.current=userId;
  const callbacks=useRef({onData,onTheme}); callbacks.current={onData,onTheme};
  const snapshot=useRef({});
  const controller=useRef(null);
  const lastRefresh=useRef(0);
  const failures=useRef(0);
  const patch=(value)=>setState((current)=>({...current,...value}));
  const reloadAppData=useCallback(async (background=false)=>{
    if(!supabaseEnabled || !userId || owner.current!==userId) return;
    controller.current?.abort();
    const request=new AbortController(); controller.current=request;
    const valid=()=>!request.signal.aborted && owner.current===userId;
    patch({isRefreshing:true});
    const apply=(data)=>{
      if(!valid()) return;
      snapshot.current=data;
      callbacks.current.onData(data);
      if(data.profile?.theme) callbacks.current.onTheme(data.profile.theme);
      patch({dataOwnerId:userId,dataReady:true,dataLoadError:""});
    };
    try {
      const data=await loadConcertData({signal:request.signal,previous:snapshot.current,
        includeDiscovery:background!=="write" && (background!==true || Date.now()-(snapshot.current.discoveryUpdatedAt||0)>15*60000),onArchive:apply});
      if(!valid()) return;
      apply(data);
      await writeAppCache(userId,data);
      if(!valid()) return;
      lastRefresh.current=Date.now(); failures.current=0;
      patch({syncError:""});
    } catch(error) {
      if(!valid()) return;
      failures.current+=1;
      if(error.code==="42501" || error.status===401) {
        snapshot.current={}; await clearAppCache();
        patch({dataOwnerId:"",dataReady:false,dataLoadError:"We couldn’t refresh your concert archive. Try again."});
      } else if(!snapshot.current.profile) patch({dataReady:true,dataLoadError:"We couldn’t refresh your concert archive. Try again."});
      else patch({syncError:!navigator.onLine?"offline":failures.current>=3?"refresh":""});
      throw error;
    } finally { if(valid()) patch({isRefreshing:false}); }
  },[userId]);

  useEffect(()=>{
    if(!supabaseEnabled) return;
    let cancelled=false;
    controller.current?.abort(); controller.current=null; snapshot.current={}; lastRefresh.current=0;
    patch({dataReady:false,dataOwnerId:"",dataLoadError:"",syncError:""});
    if(userId) void (async()=>{
      const cached=await readAppCache(userId);
      if(cancelled || owner.current!==userId) return;
      if(controller.current && !controller.current.signal.aborted) return;
      if(cached?.data) { snapshot.current=cached.data;callbacks.current.onData(cached.data);patch({dataReady:true,dataOwnerId:userId}); }
      try { await reloadAppData(); } catch { /* State contains the recoverable error. */ }
    })();
    return ()=>{cancelled=true;controller.current?.abort();};
  },[userId,reloadAppData]);

  useEffect(()=>{
    if(!supabaseEnabled || !userId) return;
    const refresh=()=>{
      if(document.visibilityState!=="visible" || Date.now()-lastRefresh.current<5*60000) return;
      if(!navigator.onLine) {patch({syncError:"offline"});return;}
      void reloadAppData(true).catch(()=>{});
    };
    const offline=()=>patch({syncError:"offline"});
    const online=()=>{lastRefresh.current=0;refresh();};
    const timer=setInterval(refresh,5*60000);
    window.addEventListener("focus",refresh);window.addEventListener("online",online);window.addEventListener("offline",offline);document.addEventListener("visibilitychange",refresh);
    return ()=>{clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("online",online);window.removeEventListener("offline",offline);document.removeEventListener("visibilitychange",refresh);};
  },[userId,reloadAppData]);
  const retrySync=()=>reloadAppData().catch(()=>{});
  const refreshAfterWrite=()=>reloadAppData("write").catch(()=>{patch({syncError:"refresh"});});
  const acceptArchive=async data=>{
    if(!userId || owner.current!==userId)return;
    controller.current?.abort();
    const merged={...snapshot.current,...data};snapshot.current=merged;
    lastRefresh.current=Date.now();failures.current=0;
    callbacks.current.onData(merged);
    patch({dataOwnerId:userId,dataReady:true,dataLoadError:"",syncError:"",isRefreshing:false});
    await writeAppCache(userId,merged);
  };
  return {...state,reloadAppData,refreshAfterWrite,acceptArchive,retrySync};
}
