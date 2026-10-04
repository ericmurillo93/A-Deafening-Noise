import { test, expect } from "@playwright/test";

// Isolated component harness: no Supabase credentials, accounts or writes.
test.beforeEach(async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.route("**/src/lib/supabase.js",route=>route.fulfill({contentType:"text/javascript",body:`
    export const supabaseEnabled=true;
    export async function getMyConcertJournal(){return {addedAt:'2026-10-01T12:00:00Z',changes:[],memory:JSON.parse(localStorage.getItem('quality-memory')||'null')};}
    export async function saveMyConcertMemory(id,payload){localStorage.setItem('quality-memory',JSON.stringify({...JSON.parse(localStorage.getItem('quality-memory')||'{}'),...payload}));}
    export async function uploadConcertMemory(){return 'owner/42/'+crypto.randomUUID()+'.jpg';}
    export async function concertMemoryPhoto(){return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp9sAAAAASUVORK5CYII=';}
    export async function removeConcertMemoryPhoto(){}
    export async function setMyConcertPhoto(id,path,keep){const memory=JSON.parse(localStorage.getItem('quality-memory')||'{}');memory.photoPaths=keep?[...(memory.photoPaths||[]),path]:(memory.photoPaths||[]).filter(item=>item!==path);localStorage.setItem('quality-memory',JSON.stringify(memory));}
  `}));
  await page.route("**/__record-ui*",route=>route.fulfill({contentType:"text/html; charset=utf-8",body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    await import('/src/index.css');
    await import('/node_modules/@fortawesome/fontawesome-free/css/all.min.css');
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {I18nProvider}=await import('/src/lib/i18n.jsx');
    const {DialogGuardProvider,useDialogGuard}=await import("/src/components/DialogGuard.jsx");
    const Journal=(await import('/src/components/ConcertJournal.jsx')).default;
    const Suggestions=(await import('/src/pages/SuggestionsPage.jsx')).default;
    const Dialog=(await import('/src/components/ConcertDialog.jsx')).default;
    const {useDialogFocus,usePageScrollLock}=await import('/src/hooks/useUi.js');
    const params=new URLSearchParams(location.search);
    if(params.get('theme'))document.documentElement.dataset.theme=params.get('theme');
    const concert={concertId:42,artist:'RIVERSIDE',venue:'SALA SALAMANDRA',date:'13/05/2017',creator:{displayName:'Eric'}};
    function Modal(){ const guard=useDialogGuard();const ref=useDialogFocus(true);usePageScrollLock(true);return React.createElement(Dialog,{concert,location:'L’Hospitalet de Llobregat, España',primaryLabel:'Setlist',journalEnabled:true,dialogRef:ref,onEdit:()=>{},onClose:()=>guard.requestClose(()=>{document.getElementById("root").textContent="Concert closed";})},tab=>React.createElement(React.Fragment,null,
      React.createElement('div',{hidden:tab!=='details'},React.createElement('p',{className:'mb-4 text-sm text-zinc-400'},'Attended with · Papa'),React.createElement('ol',null,...Array.from({length:18},(_,index)=>React.createElement('li',{key:index,className:'border-b border-zinc-700 py-3 text-sm'},String(index+1).padStart(2,'0')+'   '+['Second Life Syndrome','Conceiving You','The Same River','Lost'][index%4])))),
      React.createElement('div',{hidden:tab==='details'},React.createElement(Journal,{concert,view:tab==='activity'?'activity':'memories'}))));}
    createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,params.has('dialog')?React.createElement(DialogGuardProvider,null,React.createElement(Modal)):React.createElement(React.Fragment,null,
      React.createElement('div',{id:'journal'},React.createElement(Journal,{concert:{concertId:42}})),
      React.createElement('div',{id:'suggestions'},React.createElement(Suggestions,{
        suggestions:[{id:'quality',artist:'EXAMPLE',date:'01/01/2030',firstSeenAt:'2026-10-01T12:00:00Z'}],
        artistImages:new Map(),reviews:{quality:{decision:'interested',reviewedAt:'2026-10-03T12:00:00Z'}},
        onInterested:()=>{},onNotInterested:()=>{},spotifyConnected:true
      })))));
  </script></body></html>`}));
  await page.goto("/__record-ui");
});

test("Unsaved concert memories require confirmation before closing", async ({ page }) => {
  await page.goto("/__record-ui?dialog=1");
  await page.getByRole("tab", { name: "My memories" }).click();
  await page.getByRole("textbox").fill("Unsaved memory");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("textbox")).toHaveValue("Unsaved memory");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Memories saved")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("Concert closed")).toBeVisible();
});

test("Rating has distinct selected stars and persists after save and reload",async({page})=>{
  await page.locator("#journal summary").filter({hasText:"My memories"}).click();
  const fourth=page.getByRole("button",{name:"Rate 4 out of 5"});
  await fourth.click();
  await expect(fourth).toHaveAttribute("aria-pressed","true");
  const color=await fourth.evaluate(element=>getComputedStyle(element).color);
  expect(await page.getByRole("button",{name:"Rate 5 out of 5"}).evaluate(element=>getComputedStyle(element).color)).not.toBe(color);
  await page.getByRole("button",{name:"Save changes"}).click();
  await expect(page.getByRole("status")).toHaveText("Memories saved");
  await page.reload();
  await page.locator("#journal summary").filter({hasText:"My memories"}).click();
  await expect(fourth).toHaveAttribute("aria-pressed","true");
  await fourth.click();
  await page.getByRole("button",{name:"Save changes"}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("quality-memory")).rating)).toBeNull();
});

test("Concert and reviewed suggestion dates appear only after opening Information",async({page})=>{
  await expect(page.getByText("Event history",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Added to your archive",{exact:true})).not.toBeVisible();
  await page.locator('#journal summary[aria-label="Activity"]').click();
  await expect(page.getByText("Added to your archive",{exact:true})).toBeVisible();
  await page.getByText("Reviewed suggestions",{exact:false}).click();
  await expect(page.getByText("Suggestion created",{exact:true})).not.toBeVisible();
  await page.locator('#suggestions summary[aria-label="Activity"]').click();
  await expect(page.getByText("Suggestion created",{exact:true})).toBeVisible();
  await expect(page.getByText("Marked Interested",{exact:true})).toBeVisible();
});

test("Multiple photos persist and deletion needs confirmation without overwriting notes",async({page})=>{
  await page.locator("#journal summary").filter({hasText:"My memories"}).click();
  await page.getByRole("textbox").fill("Unsaved note");
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp9sAAAAASUVORK5CYII=','base64');
  await page.getByLabel("Add photos",{exact:true}).setInputFiles([{name:"first.png",mimeType:"image/png",buffer:image},{name:"second.png",mimeType:"image/png",buffer:image}]);
  await expect(page.locator("#journal img")).toHaveCount(2);
  await page.getByRole("button",{name:"Save changes"}).click();
  await page.reload();
  await page.locator("#journal summary").filter({hasText:"My memories"}).click();
  await expect(page.locator("#journal img")).toHaveCount(2);
  await page.getByRole("button",{name:"Delete photo 1",exact:true}).click();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.locator("#journal img")).toHaveCount(2);
  await page.getByRole("button",{name:"Delete photo 1",exact:true}).click();
  await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(page.locator("#journal img")).toHaveCount(1);
  await expect(page.getByRole("textbox")).toHaveValue("Unsaved note");
  await page.reload();
  await page.locator("#journal summary").filter({hasText:"My memories"}).click();
  await expect(page.locator("#journal img")).toHaveCount(1);
});

test("Large input photos are optimised locally rather than rejected by byte size",async({page})=>{
  const result=await page.evaluate(async()=>{
    const {prepareMemoryPhoto}=await import('/src/lib/prepare-memory-photo.js');
    const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=3000;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const file=new File([blob,new Uint8Array(3*1024*1024)],'large.png',{type:'image/png'});
    const prepared=await prepareMemoryPhoto(file);
    const bitmap=await createImageBitmap(prepared);
    const width=bitmap.width;bitmap.close();
    return {input:file.size,output:prepared.size,type:prepared.type,width};
  });
  expect(result.input).toBeGreaterThan(2*1024*1024);
  expect(result.output).toBeLessThan(2*1024*1024);
  expect(result.type).toBe('image/jpeg');
  expect(result.width).toBeLessThanOrEqual(2400);
});

for (const theme of ["default","poster"]) test(`Concert modal preserves drafts, fixed header and keyboard tabs in ${theme}`,async({page},testInfo)=>{
  await page.goto(`/__record-ui?dialog=1&theme=${theme}`);
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const before=await dialog.boundingBox();
  await page.getByRole("tab",{name:"Setlist",exact:true}).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab",{name:"My memories"})).toHaveAttribute("aria-selected","true");
  await page.getByRole("textbox").fill("Keep my draft");
  await page.getByRole("tab",{name:"Activity",exact:true}).click();
  await expect(page.getByText("Added to your archive",{exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"My memories"}).click();
  await expect(page.getByRole("textbox")).toHaveValue("Keep my draft");
  const after=await dialog.boundingBox();
  expect(Math.abs(before.height-after.height)).toBeLessThan(2);
  await page.getByRole("tab",{name:"Setlist",exact:true}).click();
  const header=dialog.locator("header");
  const headerBefore=await header.boundingBox();
  await page.getByRole("tabpanel").evaluate(element=>{element.scrollTop=element.scrollHeight;});
  expect(Math.abs((await header.boundingBox()).y-headerBefore.y)).toBeLessThan(2);
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.getByRole("tabpanel").evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:testInfo.outputPath(`modal-${theme}.png`),animations:"disabled",scale:"css"});
  await page.getByRole("tab",{name:"My memories"}).click();
  await page.screenshot({path:testInfo.outputPath(`memories-${theme}.png`),animations:"disabled",scale:"css"});
});
