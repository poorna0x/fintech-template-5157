/**
 * W3C WebAuthn JSON helpers (same ceremony as @supabase/auth-js passkeys).
 * Stable supabase-js 2.112.x does not ship signInWithPasskey yet.
 */

function base64UrlToUint8Array(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64URL(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export type WebAuthnCreationOptionsJSON = {
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
};

export type WebAuthnRequestOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
};

export function deserializeCredentialCreationOptions(
  options: WebAuthnCreationOptionsJSON
): PublicKeyCredentialCreationOptions {
  const native = PublicKeyCredential as unknown as {
    parseCreationOptionsFromJSON?: (o: unknown) => PublicKeyCredentialCreationOptions;
  };
  if (typeof native.parseCreationOptionsFromJSON === 'function') {
    return native.parseCreationOptionsFromJSON(options);
  }

  const { challenge, user, excludeCredentials, ...rest } = options;
  const result: PublicKeyCredentialCreationOptions = {
    ...rest,
    challenge: base64UrlToUint8Array(challenge).buffer as ArrayBuffer,
    user: {
      ...user,
      id: base64UrlToUint8Array(user.id).buffer as ArrayBuffer,
    },
  };
  if (excludeCredentials?.length) {
    result.excludeCredentials = excludeCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToUint8Array(cred.id).buffer as ArrayBuffer,
      type: cred.type || 'public-key',
    }));
  }
  return result;
}

export function deserializeCredentialRequestOptions(
  options: WebAuthnRequestOptionsJSON
): PublicKeyCredentialRequestOptions {
  const native = PublicKeyCredential as unknown as {
    parseRequestOptionsFromJSON?: (o: unknown) => PublicKeyCredentialRequestOptions;
  };
  if (typeof native.parseRequestOptionsFromJSON === 'function') {
    return native.parseRequestOptionsFromJSON(options);
  }

  const { challenge, allowCredentials, ...rest } = options;
  const result: PublicKeyCredentialRequestOptions = {
    ...rest,
    challenge: base64UrlToUint8Array(challenge).buffer as ArrayBuffer,
  };
  if (allowCredentials?.length) {
    result.allowCredentials = allowCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToUint8Array(cred.id).buffer as ArrayBuffer,
      type: cred.type || 'public-key',
    }));
  }
  return result;
}

export function serializeCredentialCreationResponse(
  credential: PublicKeyCredential
): Record<string, unknown> {
  if (typeof (credential as PublicKeyCredential & { toJSON?: () => unknown }).toJSON === 'function') {
    return (credential as PublicKeyCredential & { toJSON: () => Record<string, unknown> }).toJSON();
  }
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: credential.id,
    type: 'public-key',
    response: {
      attestationObject: bytesToBase64URL(new Uint8Array(response.attestationObject)),
      clientDataJSON: bytesToBase64URL(new Uint8Array(response.clientDataJSON)),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
  };
}

export function serializeCredentialRequestResponse(
  credential: PublicKeyCredential
): Record<string, unknown> {
  if (typeof (credential as PublicKeyCredential & { toJSON?: () => unknown }).toJSON === 'function') {
    return (credential as PublicKeyCredential & { toJSON: () => Record<string, unknown> }).toJSON();
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: credential.id,
    type: 'public-key',
    response: {
      authenticatorData: bytesToBase64URL(new Uint8Array(response.authenticatorData)),
      clientDataJSON: bytesToBase64URL(new Uint8Array(response.clientDataJSON)),
      signature: bytesToBase64URL(new Uint8Array(response.signature)),
      userHandle: response.userHandle
        ? bytesToBase64URL(new Uint8Array(response.userHandle))
        : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
  };
}
