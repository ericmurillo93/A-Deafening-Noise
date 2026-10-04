import React, { useEffect, useState } from "react";
import { concertMemoryPhoto, uploadConcertMemory, setMyConcertPhoto, removeConcertMemoryPhoto } from "../lib/supabase";
import { useI18n } from "../lib/i18n.jsx";

export default function ConcertPhotoGallery({ concertId, paths, onChanged }) {
  const { t } = useI18n();
  const [urls,setUrls] = useState({});
  const [busy,setBusy] = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(null);
  const [cleanupPath,setCleanupPath] = useState(null);
  const [error,setError] = useState("");
  const pathKey = JSON.stringify(paths);
  useEffect(()=>{
    let active=true;
    Promise.all(paths.map(async path=>[path,await concertMemoryPhoto(path)])).then(entries=>{if(active)setUrls(Object.fromEntries(entries));}).catch(()=>{if(active)setError(t("Could not load your photos. Reopen the concert to try again."));});
    return()=>{active=false;};
  },[pathKey]);
  async function addPhotos(files) {
    if (!files.length) return;
    setBusy(true);setError("");
    let current=[...paths];
    try {
      // Sequential preparation keeps large images from exhausting phone memory.
      for (const file of files) {
        const path=await uploadConcertMemory(concertId,file);
        try { await setMyConcertPhoto(concertId,path,true); }
        catch(error) { await removeConcertMemoryPhoto(path).catch(()=>{});throw error; }
        current=[...current,path];onChanged(current);
      }
    } catch(error) { setError(t(error.message==="Choose a JPG, PNG or WebP image."?error.message:"Could not add this photo. Previously added photos are safe. Try again.")); }
    finally {setBusy(false);}
  }
  async function finishCleanup(path) {
    await removeConcertMemoryPhoto(path);
    setCleanupPath(null);setError("");
  }
  async function deletePhoto(path) {
    setBusy(true);setError("");
    try {
      await setMyConcertPhoto(concertId,path,false);
      onChanged(paths.filter(item=>item!==path));setConfirmDelete(null);
      try {await finishCleanup(path);} catch {setCleanupPath(path);setError(t("Photo removed. Retry to finish storage cleanup."));}
    } catch {setError(t("Could not delete this photo. Try again."));}
    finally {setBusy(false);}
  }
  return <fieldset disabled={busy} className="space-y-3">
    {paths.length>0 && <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">{paths.map((path,index)=><figure key={path} className="relative min-w-0">
      <div className="aspect-[4/3] overflow-hidden rounded-md bg-[var(--adn-card)]">{urls[path] && <a href={urls[path]} target="_blank" rel="noreferrer" aria-label={t("Open photo {number}",{number:index+1})}><img src={urls[path]} alt={t("Concert photo {number}",{number:index+1})} className="h-full w-full object-cover" loading="lazy" /></a>}</div>
      {confirmDelete===path ? <figcaption className="space-y-2 pt-2"><p className="text-sm text-zinc-300">{t("Delete photo?")}</p><div className="flex flex-wrap gap-2"><button type="button" className="adn-button-secondary !px-3" onClick={()=>setConfirmDelete(null)}>{t("Cancel")}</button><button type="button" className="adn-button-danger !px-3" onClick={()=>void deletePhoto(path)}>{t("Delete")}</button></div></figcaption> : <figcaption className="absolute right-1 top-1"><button type="button" aria-label={t("Delete photo {number}",{number:index+1})} className="flex h-11 w-11 items-center justify-center rounded-md bg-black/75 text-white hover:bg-black/90" onClick={()=>setConfirmDelete(path)}><i className="fa-solid fa-trash-can" aria-hidden="true" /></button></figcaption>}
    </figure>)}</div>}
    <label className="adn-button-secondary inline-flex cursor-pointer">{t(busy?"Updating photos…":"Add photos")}<input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={t("Add photos")} className="sr-only" onChange={event=>{const files=Array.from(event.target.files || []);event.target.value="";void addPhotos(files);}} /></label>
    <p className="text-xs text-zinc-400">{t("Photos are optimised and saved automatically.")}</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {cleanupPath && <button type="button" className="adn-button-secondary" onClick={async()=>{setBusy(true);try{await finishCleanup(cleanupPath);}catch{setError(t("Photo removed. Retry to finish storage cleanup."));}finally{setBusy(false);}}}>{t("Retry")}</button>}
  </fieldset>;
}
