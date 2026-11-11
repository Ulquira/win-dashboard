import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 10;

export { BCRYPT_ROUNDS };

/**
 * JWT Estándar con HMAC HS256.
 * JWT_SECRET es obligatorio (validado por env.ts). Sin fallbacks hardcodeados.
 */
export function signAuthToken(payload: Record<string, any>): string {
  const { exp, iat, ...cleanPayload } = payload;
  return jwt.sign(cleanPayload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '12h',
  });
}

/**
 * Verifica un JWT. Incluye fallback temporal para tokens de 2 segmentos
 * emitidos antes de la actualización a JWT estándar.
 */
export function verifyAuthToken(token?: string): Record<string, any> | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as Record<string, any>;
  } catch {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(base64Payload)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    try {
      const decoded = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8'));
      if (decoded.exp && Date.now() > decoded.exp) return null;
      return decoded;
    } catch {
      return null;
    }
  }
}
