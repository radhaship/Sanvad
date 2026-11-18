import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const PRIV_KEY_STORAGE = 'sanvad_e2e_priv_jwk';
const PUB_KEY_STORAGE = 'sanvad_e2e_pub_jwk';

export async function getOrGenerateUserKeyPair(uid: string): Promise<CryptoKey> {
  try {
    const rawPriv = localStorage.getItem(`${PRIV_KEY_STORAGE}_${uid}`);
    const rawPub = localStorage.getItem(`${PUB_KEY_STORAGE}_${uid}`);

    if (rawPriv && rawPub) {
      const privJwk = JSON.parse(rawPriv);
      const pubJwk = JSON.parse(rawPub);
      
      const privKey = await window.crypto.subtle.importKey(
        'jwk',
        privJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['decrypt']
      );
      return privKey;
    }
  } catch (err) {
    console.error('Error loading local E2EE keys:', err);
  }

  // Generate new RSA-OAEP key pair
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const exportedPriv = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const exportedPub = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

  localStorage.setItem(`${PRIV_KEY_STORAGE}_${uid}`, JSON.stringify(exportedPriv));
  localStorage.setItem(`${PUB_KEY_STORAGE}_${uid}`, JSON.stringify(exportedPub));

  // Publish public key to user document in Firestore
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      publicKey: JSON.stringify(exportedPub),
    });
  } catch (err) {
    console.error('Failed to publish E2EE public key to Firestore:', err);
  }

  return keyPair.privateKey;
}

export async function getPeerPublicKey(peerUid: string): Promise<CryptoKey | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', peerUid));
    if (!userDoc.exists()) return null;
    const data = userDoc.data();
    if (!data.publicKey) return null;

    const pubJwk = JSON.parse(data.publicKey);
    return await window.crypto.subtle.importKey(
      'jwk',
      pubJwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );
  } catch (err) {
    console.error('Error fetching peer public key:', err);
    return null;
  }
}

export async function encryptE2EEMessage(text: string, peerPubs: CryptoKey[]): Promise<string> {
  if (peerPubs.length === 0) return text;

  try {
    // Generate ephemeral AES-GCM key
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encodedText
    );

    // Export raw AES key
    const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

    // Encrypt AES key with each peer's RSA public key
    const encryptedKeys: string[] = [];
    for (const pub of peerPubs) {
      const encKeyBuf = await window.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        pub,
        rawAesKey
      );
      encryptedKeys.push(btoa(String.fromCharCode(...new Uint8Array(encKeyBuf))));
    }

    const payload = {
      v: 1,
      iv: btoa(String.fromCharCode(...iv)),
      ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      eks: encryptedKeys,
    };

    return `ENC:${JSON.stringify(payload)}`;
  } catch (err) {
    console.error('E2EE encryption error:', err);
    return text;
  }
}

export async function decryptE2EEMessage(encString: string, myPrivKey: CryptoKey): Promise<string> {
  if (!encString.startsWith('ENC:')) return encString;

  try {
    const jsonStr = encString.slice(4);
    const payload = JSON.parse(jsonStr);

    const iv = new Uint8Array(atob(payload.iv).split('').map((c) => c.charCodeAt(0)));
    const ct = new Uint8Array(atob(payload.ct).split('').map((c) => c.charCodeAt(0)));

    // Try decrypting with private key from eks array
    let aesKey: CryptoKey | null = null;
    for (const ekBase64 of payload.eks) {
      try {
        const ekBuf = new Uint8Array(atob(ekBase64).split('').map((c) => c.charCodeAt(0)));
        const rawAes = await window.crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          myPrivKey,
          ekBuf
        );
        aesKey = await window.crypto.subtle.importKey(
          'raw',
          rawAes,
          { name: 'AES-GCM', length: 256 },
          true,
          ['decrypt']
        );
        break;
      } catch {
        // try next key if multiple
      }
    }

    if (!aesKey) {
      return '🔒 [Encrypted message - Key mismatch]';
    }

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ct
    );

    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    console.error('E2EE decryption error:', err);
    return '🔒 [Decryption failed]';
  }
}
