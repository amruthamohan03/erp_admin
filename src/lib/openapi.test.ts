import { describe, it, expect } from 'vitest';
import { generateOpenApiDocument } from './openapi';

// Expected matrix of paths × HTTP methods. If you add or remove an endpoint,
// update this — the test then guards against accidental regressions (silent
// removals, typo'd renames, methods dropped from a route).
const EXPECTED_PATHS: Record<string, ReadonlyArray<string>> = {
  '/auth/login': ['post'],
  '/auth/me': ['get'],
  '/auth/logout': ['post'],
  '/users': ['get', 'post'],
  '/users/{id}': ['get', 'put', 'delete'],
  '/menus': ['get', 'post'],
  '/menus/{id}': ['get', 'put', 'delete'],
  '/roles': ['get', 'post'],
  '/roles/{id}': ['get', 'put', 'delete'],
  '/dashboard-cards': ['get', 'post'],
  '/dashboard-cards/{id}': ['get', 'put', 'delete'],
  '/dashboard-cards/me': ['get'],
  '/me/profile': ['get', 'put'],
  '/me/preferences': ['put'],
  '/me/password': ['put'],
  '/me/avatar': ['post', 'delete'],
  '/me/signature': ['post', 'delete'],
  '/translate': ['post'],
  '/role-menu-mapping': ['get', 'put'],
  '/role-dashboard-card-mapping': ['get', 'put'],
  // §4.33 — the six reference formats. No post/delete: the set of references is
  // fixed by code, so this endpoint edits them and cannot add or remove one.
  '/mca-ref-formats': ['get', 'put'],
  '/mca-ref-formats/preview': ['get'],
  '/forms/{formKey}': ['get'],
  '/cases/{templateKey}': ['get', 'post'],
  '/cases/{templateKey}/{caseId}': ['get'],
  '/cases/{templateKey}/{caseId}/transitions/{transitionKey}': ['post'],
};

// Schema components that must be exposed regardless of which endpoints
// reference them — clients pulling types out of the document depend on this.
const EXPECTED_SCHEMAS = [
  'LoginInput',
  'LoginResponse',
  'MeResponse',
  'PasswordChangeInput',
  'PreferencesUpdateInput',
  'ProfileUpdateInput',
  'ProfileResponse',
  'TranslateBatchInput',
  'UserCreateInput',
  'UserUpdateInput',
  'UserListQuery',
  'UserResponse',
  'MenuCreateInput',
  'MenuUpdateInput',
  'MenuResponse',
  'RoleCreateInput',
  'RoleUpdateInput',
  'RoleResponse',
  'DashboardCardCreateInput',
  'DashboardCardUpdateInput',
  'DashboardCardResponse',
  'RoleMenuMappingPutInput',
  'RoleMenuMappingGetResponse',
  'RoleDashboardCardMappingPutInput',
  'RoleDashboardCardMappingGetResponse',
  'FormDefinitionResponse',
  'CaseCreateInput',
  'CaseCreateResponse',
  'CaseReadResponse',
  'CaseAdvanceResponse',
  'ErrorEnvelope',
] as const;

describe('OpenAPI document', () => {
  const doc = generateOpenApiDocument();

  it('declares OpenAPI 3.0', () => {
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBe('ERP Admin API');
  });

  it('registers every expected component schema', () => {
    const schemas = Object.keys(doc.components?.schemas ?? {});
    for (const name of EXPECTED_SCHEMAS) {
      expect(schemas).toContain(name);
    }
    expect(schemas.length).toBeGreaterThanOrEqual(EXPECTED_SCHEMAS.length);
  });

  it('documents every endpoint × method in the expected matrix', () => {
    const paths = (doc.paths ?? {}) as Record<
      string,
      Record<string, unknown> | undefined
    >;
    // Every expected path is present, with every expected method on it.
    for (const [path, methods] of Object.entries(EXPECTED_PATHS)) {
      expect(paths[path], `Missing path: ${path}`).toBeDefined();
      for (const method of methods) {
        expect(
          paths[path]?.[method],
          `Missing ${method.toUpperCase()} ${path}`,
        ).toBeDefined();
      }
    }
    // No unexpected extras — if the registry grows, update the matrix
    // intentionally rather than letting paths slip in unnoticed.
    expect(Object.keys(paths).sort()).toEqual(Object.keys(EXPECTED_PATHS).sort());
  });

  it('login 200 references the success envelope shape', () => {
    const paths = doc.paths ?? {};
    const login200 = paths['/auth/login']?.post?.responses?.['200'];
    const loginBody = (login200 as { content: Record<string, { schema: unknown }> } | undefined)
      ?.content?.['application/json']?.schema as { properties?: Record<string, unknown> } | undefined;
    expect(loginBody?.properties).toHaveProperty('ok');
    expect(loginBody?.properties).toHaveProperty('data');
  });

  it('error responses reference the ErrorEnvelope shape', () => {
    const paths = doc.paths ?? {};
    const unauthorized = paths['/users']?.get?.responses?.['401'];
    const body = (unauthorized as { content: Record<string, { schema: unknown }> } | undefined)
      ?.content?.['application/json']?.schema as { properties?: Record<string, unknown> } | undefined;
    expect(body?.properties).toHaveProperty('ok');
    expect(body?.properties).toHaveProperty('error');
  });
});
