// Signed upload protocol used by supabase/storage-js; no session or service key
// is sent to storage. The server-issued token authorizes this one object path.
export function createSignedStorageClient({supabaseUrl,fetchImpl=globalThis.fetch}={}){
 const base=new URL(supabaseUrl);
 if(base.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Storage HTTPS kerak.');
 return Object.freeze({async uploadToSignedUrl(bucket,path,token,file){
   if(bucket!=='support-attachments'||!token||typeof path!=='string'||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Storage manzili noto‘g‘ri.');
   const url=new URL(`/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,base.origin);
   url.searchParams.set('token',token);
   const body=new FormData();body.append('cacheControl','3600');body.append('',file,file.name||'attachment');
   const response=await fetchImpl(url.href,{method:'PUT',headers:{'x-upsert':'false'},body,credentials:'omit',redirect:'error'});
   return response.ok?{data:{path},error:null}:{data:null,error:{message:'Faylni yuklab bo‘lmadi.'}};
 }});
}
