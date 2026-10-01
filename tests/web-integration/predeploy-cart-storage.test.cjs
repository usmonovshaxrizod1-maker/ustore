const test=require('node:test'),assert=require('node:assert/strict');
test('uncertain atomic addition retries the same mutation identity without replacing a cart',async()=>{
 const {createLiveShopPrivateAdapters}=await import('../../web/services/live/shop-private.js');const calls=[];
 const c=createLiveShopPrivateAdapters({endpoint:'https://api.example/shop-api',botId:'123',tokenStore:{get:()=> 'session'},fetchImpl:async(_,init)=>{const body=JSON.parse(init.body);calls.push(body);if(calls.length===1)throw Error('lost response');return {ok:true,status:200,json:async()=>({cart:{shopId:'s',lines:[body.payload.line]}})};}}).cart;
 assert.equal((await c.addLine({productId:'p',quantity:1})).ok,false);assert.equal((await c.addLine({productId:'p',quantity:1})).ok,true);
 assert.equal(calls[0].payload.mutationId,calls[1].payload.mutationId);assert.deepEqual(calls.map(x=>x.action),['web_cart_mutate','web_cart_mutate']);
 await c.addLine({productId:'p',quantity:1});assert.notEqual(calls[2].payload.mutationId,calls[1].payload.mutationId);
 assert.equal((await c.updateLine({lineKey:'p',quantity:100})).ok,false);assert.equal(calls.length,3);
});
test('private attachment uploader uses signed scoped URL, multipart and no user credentials',async()=>{
 const {createSignedStorageClient}=await import('../../web/services/live/storage.js');let seen;
 const c=createSignedStorageClient({supabaseUrl:'https://project.supabase.co',fetchImpl:async(url,init)=>{seen={url,init};return {ok:true};}});
 const file=new File(['png'],'image.png',{type:'image/png'});assert.equal((await c.uploadToSignedUrl('support-attachments','shops/s/support/u/a.png','secret-token',file)).error,null);
 assert.equal(new URL(seen.url).searchParams.get('token'),'secret-token');assert.equal(seen.init.method,'PUT');assert.equal(seen.init.credentials,'omit');assert.equal(seen.init.headers.authorization,undefined);assert.equal(seen.init.body.get('').name,'image.png');
 await assert.rejects(c.uploadToSignedUrl('support-attachments','../escape','token',file));
});
