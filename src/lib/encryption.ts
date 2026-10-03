import crypto from 'node:crypto';
function secret(version=process.env.ENCRYPTION_KEY_VERSION||'1') {
 const value=version===(process.env.ENCRYPTION_KEY_VERSION||'1')?process.env.ENCRYPTION_KEY:process.env[`ENCRYPTION_KEY_V${version}`];
 if(!value)throw new Error('Encryption key unavailable');return value;
}
export function encrypt(text:string,context='application'):string {
 if(typeof text!=='string'||!text)throw new Error('Cannot encrypt empty credentials');
 const version=process.env.ENCRYPTION_KEY_VERSION||'1';if(!/^\d+$/.test(version))throw new Error('Invalid key version');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(secret(version)).digest(),iv);
 cipher.setAAD(Buffer.from(context));const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return `v2:${version}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}
export function decrypt(text:string,context='application'):string {
 if(typeof text!=='string'||!text)return '';
 try{
  if(text.startsWith('v2:')){
   const [,version,iv,tag,body]=text.split(':');
   const decipher=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(secret(version)).digest(),Buffer.from(iv,'hex'));
   decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(tag,'hex'));
   return Buffer.concat([decipher.update(Buffer.from(body,'hex')),decipher.final()]).toString('utf8');
  }
  // Existing authenticated ciphertext remains readable for a controlled key migration.
  // Plaintext is never accepted, including when a migration flag is absent.
  if(!/^[a-f0-9]{32}:[a-f0-9]{32}:[a-f0-9]+$/i.test(text))return '';
  const [iv,tag,body]=text.split(':');const legacyKey=crypto.createHash('sha256').update(secret()).digest('base64').substring(0,32);
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(legacyKey),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([decipher.update(Buffer.from(body,'hex')),decipher.final()]).toString('utf8');
 }catch{return ''}
}
