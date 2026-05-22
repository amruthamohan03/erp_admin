import { describe, it, expect } from 'vitest';
import { generateOpenApiDocument } from './openapi';

describe('OpenAPI document', () => {
  const doc = generateOpenApiDocument();

  it('declares OpenAPI 3.0', () => {
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBe('ERP Admin API');
  });

  it('registers all centralized schemas', () => {
    const schemas = Object.keys(doc.components?.schemas ?? {});
    // Spot-check a few — the registry registers ~19. If a schema is removed
    // intentionally, update the list; if it's removed accidentally, this
    // catches it.
    expect(schemas).toContain('LoginInput');
    expect(schemas).toContain('LoginResponse');
    expect(schemas).toContain('MeResponse');
    expect(schemas).toContain('UserCreateInput');
    expect(schemas).toContain('UserUpdateInput');
    expect(schemas).toContain('ErrorEnvelope');
    expect(schemas.length).toBeGreaterThanOrEqual(19);
  });

  it('documents the auth endpoints with envelope-shaped responses', () => {
    const paths = doc.paths ?? {};
    expect(paths['/auth/login']?.post).toBeDefined();
    expect(paths['/auth/me']?.get).toBeDefined();
    expect(paths['/auth/logout']?.post).toBeDefined();

    // login 200 should reference the success envelope shape
    const login200 = paths['/auth/login']?.post?.responses?.['200'];
    const loginBody = (login200 as { content: Record<string, { schema: unknown }> } | undefined)
      ?.content?.['application/json']?.schema as { properties?: Record<string, unknown> } | undefined;
    expect(loginBody?.properties).toHaveProperty('ok');
    expect(loginBody?.properties).toHaveProperty('data');
  });
});
