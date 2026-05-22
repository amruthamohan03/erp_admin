import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  loginSchema,
  loginResponseSchema,
  meResponseSchema,
  passwordChangeSchema,
  preferencesUpdateSchema,
  profileUpdateSchema,
  translateBatchSchema,
  userCreateSchema,
  userUpdateSchema,
  userListQuerySchema,
  userResponseSchema,
  menuCreateSchema,
  menuUpdateSchema,
  roleCreateSchema,
  roleUpdateSchema,
  dashboardCardCreateSchema,
  dashboardCardUpdateSchema,
  roleMenuMappingPutSchema,
  roleDashboardCardMappingPutSchema,
} from '@/schemas';

// OpenAPI generation per root CLAUDE.md §4.4. Schemas are the source of
// truth for both runtime validation and the published API contract.
// Endpoint annotations are added in batches per route group — this slice
// covers auth (login / me / logout); future slices will cover users,
// menus, roles, dashboard-cards, me/*, mappings, translate.

// Mutates ZodType.prototype so registry.register() can attach refIds via
// .openapi(). Safe to call repeatedly — the lib no-ops a second extension.
let extended = false;
function ensureExtended(): void {
  if (extended) return;
  extendZodWithOpenApi(z);
  extended = true;
}

// Generic error envelope per §4.4 — { ok: false, error: { code, message, details? } }.
const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// Wrap a Zod data schema in the success envelope: { ok: true, data: T, meta? }.
function okEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

// Paginated list envelope: data is an array, meta carries pagination counts.
function paginatedEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    ok: z.literal(true),
    data: z.array(item),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
    }),
  });
}

function jsonOk<T extends z.ZodTypeAny>(description: string, data: T) {
  return {
    description,
    content: { 'application/json': { schema: okEnvelope(data) } },
  };
}

function jsonPaginated<T extends z.ZodTypeAny>(description: string, item: T) {
  return {
    description,
    content: { 'application/json': { schema: paginatedEnvelope(item) } },
  };
}

function jsonError(description: string) {
  return {
    description,
    content: { 'application/json': { schema: errorEnvelopeSchema } },
  };
}

const idParamSchema = z.object({ id: z.string() });

function buildRegistry(): OpenAPIRegistry {
  ensureExtended();
  const registry = new OpenAPIRegistry();

  // Component schemas — request bodies + a couple of response payloads.
  registry.register('LoginInput', loginSchema);
  registry.register('LoginResponse', loginResponseSchema);
  registry.register('MeResponse', meResponseSchema);
  registry.register('PasswordChangeInput', passwordChangeSchema);
  registry.register('PreferencesUpdateInput', preferencesUpdateSchema);
  registry.register('ProfileUpdateInput', profileUpdateSchema);
  registry.register('TranslateBatchInput', translateBatchSchema);
  registry.register('UserCreateInput', userCreateSchema);
  registry.register('UserUpdateInput', userUpdateSchema);
  registry.register('UserListQuery', userListQuerySchema);
  registry.register('UserResponse', userResponseSchema);
  registry.register('MenuCreateInput', menuCreateSchema);
  registry.register('MenuUpdateInput', menuUpdateSchema);
  registry.register('RoleCreateInput', roleCreateSchema);
  registry.register('RoleUpdateInput', roleUpdateSchema);
  registry.register('DashboardCardCreateInput', dashboardCardCreateSchema);
  registry.register('DashboardCardUpdateInput', dashboardCardUpdateSchema);
  registry.register('RoleMenuMappingPutInput', roleMenuMappingPutSchema);
  registry.register(
    'RoleDashboardCardMappingPutInput',
    roleDashboardCardMappingPutSchema,
  );

  // Reusable error envelope component.
  registry.register('ErrorEnvelope', errorEnvelopeSchema);

  // --- Auth endpoints ---------------------------------------------------

  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    summary: 'Authenticate with username/password and set the session cookie',
    tags: ['auth'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: loginSchema } },
      },
    },
    responses: {
      200: jsonOk('Authenticated; session cookie set', loginResponseSchema),
      401: jsonError('Invalid credentials'),
      403: jsonError('Account is disabled'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    summary: 'Return the authenticated session user',
    tags: ['auth'],
    responses: {
      200: jsonOk('Current user', meResponseSchema),
      401: jsonError('Unauthorized'),
      404: jsonError('User not found'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    summary: 'Clear the session cookie',
    tags: ['auth'],
    responses: {
      200: jsonOk(
        'Logged out',
        z.object({ message: z.string() }),
      ),
    },
  });

  // --- Users endpoints --------------------------------------------------

  registry.registerPath({
    method: 'get',
    path: '/users',
    summary: 'Paginated list of active users; q filters by username/name/email',
    tags: ['users'],
    request: { query: userListQuerySchema },
    responses: {
      200: jsonPaginated('Paginated users', userResponseSchema),
      401: jsonError('Unauthorized'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/users',
    summary: 'Create a user',
    tags: ['users'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: userCreateSchema } },
      },
    },
    responses: {
      201: jsonOk('Created', userResponseSchema),
      400: jsonError('Invalid role_id'),
      401: jsonError('Unauthorized'),
      409: jsonError('Username or email already exists'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/users/{id}',
    summary: 'Get a user by id',
    tags: ['users'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('User', userResponseSchema),
      400: jsonError('Invalid id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/users/{id}',
    summary: 'Update a user (partial — only changed fields)',
    tags: ['users'],
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: userUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk('Updated', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / nothing to update / invalid role_id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
      409: jsonError('Email already exists'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/users/{id}',
    summary: 'Soft-delete a user (sets display=N). Cannot delete self.',
    tags: ['users'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Deleted', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / cannot delete yourself'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  return registry;
}

export function generateOpenApiDocument() {
  const registry = buildRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'ERP Admin API',
      version: '0.1.0',
      description:
        'Customs clearance & logistics ERP. Schemas auto-generated from src/schemas/.',
    },
    servers: [{ url: '/api/v1' }],
  });
}
