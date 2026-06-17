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
  menuResponseSchema,
  roleCreateSchema,
  roleUpdateSchema,
  roleResponseSchema,
  dashboardCardCreateSchema,
  dashboardCardUpdateSchema,
  dashboardCardResponseSchema,
  roleMenuMappingPutSchema,
  roleMenuMappingGetResponseSchema,
  roleDashboardCardMappingPutSchema,
  roleDashboardCardMappingGetResponseSchema,
  profileResponseSchema,
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
  registry.register('MenuResponse', menuResponseSchema);
  registry.register('RoleCreateInput', roleCreateSchema);
  registry.register('RoleUpdateInput', roleUpdateSchema);
  registry.register('RoleResponse', roleResponseSchema);
  registry.register('DashboardCardCreateInput', dashboardCardCreateSchema);
  registry.register('DashboardCardUpdateInput', dashboardCardUpdateSchema);
  registry.register('DashboardCardResponse', dashboardCardResponseSchema);
  registry.register('RoleMenuMappingPutInput', roleMenuMappingPutSchema);
  registry.register(
    'RoleMenuMappingGetResponse',
    roleMenuMappingGetResponseSchema,
  );
  registry.register(
    'RoleDashboardCardMappingPutInput',
    roleDashboardCardMappingPutSchema,
  );
  registry.register(
    'RoleDashboardCardMappingGetResponse',
    roleDashboardCardMappingGetResponseSchema,
  );
  registry.register('ProfileResponse', profileResponseSchema);

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

  // --- Menus endpoints --------------------------------------------------

  const menuListQuerySchema = z.object({
    flat: z.enum(['0', '1']).optional(),
    all: z.enum(['0', '1']).optional(),
    includeHidden: z.enum(['0', '1']).optional(),
  });

  registry.registerPath({
    method: 'get',
    path: '/menus',
    summary:
      'Menu tree (default) or flat list (?flat=1). Role-scoped unless ?all=1. Excludes display=N unless ?includeHidden=1.',
    tags: ['menus'],
    request: { query: menuListQuerySchema },
    responses: {
      200: jsonOk('Menu rows (flat array, or tree with nested children)', z.array(menuResponseSchema)),
      401: jsonError('Unauthorized'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/menus',
    summary: 'Create a menu (max 2 levels — parent must be top-level)',
    tags: ['menus'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: menuCreateSchema } },
      },
    },
    responses: {
      201: jsonOk('Created', menuResponseSchema),
      400: jsonError('Parent not found / only 2 levels supported'),
      401: jsonError('Unauthorized'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/menus/{id}',
    summary: 'Get a menu by id (with parent_name joined)',
    tags: ['menus'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Menu', menuResponseSchema),
      400: jsonError('Invalid id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/menus/{id}',
    summary: 'Update a menu. Blocks self-parenting and 3+ levels.',
    tags: ['menus'],
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: menuUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk('Updated', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / self-parent / 3-level / has children'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/menus/{id}',
    summary: 'Soft-delete a menu. Refuses if it has active children.',
    tags: ['menus'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Deleted', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / menu has active children'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  // --- Roles endpoints --------------------------------------------------

  registry.registerPath({
    method: 'get',
    path: '/roles',
    summary: 'List active roles (with parent_role_name joined)',
    tags: ['roles'],
    responses: {
      200: jsonOk('Roles', z.array(roleResponseSchema)),
      401: jsonError('Unauthorized'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/roles',
    summary: 'Create a role',
    tags: ['roles'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: roleCreateSchema } },
      },
    },
    responses: {
      201: jsonOk('Created', roleResponseSchema),
      400: jsonError('Invalid parent_role_id'),
      401: jsonError('Unauthorized'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/roles/{id}',
    summary: 'Get a role by id (with parent_role_name joined)',
    tags: ['roles'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Role', roleResponseSchema),
      400: jsonError('Invalid id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/roles/{id}',
    summary: 'Update a role. Blocks self-parenting.',
    tags: ['roles'],
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: roleUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk('Updated', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / self-parent / invalid parent_role_id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/roles/{id}',
    summary: 'Soft-delete a role. Refuses if active users still reference it.',
    tags: ['roles'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Deleted', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / role in use by active users'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  // --- Dashboard cards endpoints ----------------------------------------

  const dashboardCardListQuerySchema = z.object({
    includeHidden: z.enum(['0', '1']).optional(),
    menu_id: z.string().optional(),
  });

  registry.registerPath({
    method: 'get',
    path: '/dashboard-cards',
    summary:
      'List cards. Filters: ?includeHidden=1 (admin), ?menu_id (scope to one menu).',
    tags: ['dashboard-cards'],
    request: { query: dashboardCardListQuerySchema },
    responses: {
      200: jsonOk('Dashboard cards', z.array(dashboardCardResponseSchema)),
      401: jsonError('Unauthorized'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/dashboard-cards',
    summary: 'Create a dashboard card',
    tags: ['dashboard-cards'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: dashboardCardCreateSchema } },
      },
    },
    responses: {
      201: jsonOk('Created', z.object({ id: z.number().int() })),
      401: jsonError('Unauthorized'),
      409: jsonError('card_key already exists'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/dashboard-cards/{id}',
    summary: 'Get a dashboard card by id',
    tags: ['dashboard-cards'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Dashboard card', dashboardCardResponseSchema),
      400: jsonError('Invalid id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/dashboard-cards/{id}',
    summary: 'Update a dashboard card',
    tags: ['dashboard-cards'],
    request: {
      params: idParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: dashboardCardUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk('Updated', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id / nothing to update'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
      409: jsonError('card_key already exists'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/dashboard-cards/{id}',
    summary: 'Soft-delete a dashboard card (sets display=N)',
    tags: ['dashboard-cards'],
    request: { params: idParamSchema },
    responses: {
      200: jsonOk('Deleted', z.object({ id: z.number().int() })),
      400: jsonError('Invalid id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Not found'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/dashboard-cards/me',
    summary:
      "Cards visible to the current user's role. Subset shape — no menu/order/display fields.",
    tags: ['dashboard-cards'],
    responses: {
      200: jsonOk("Current user's dashboard cards", z.array(dashboardCardResponseSchema)),
      401: jsonError('Unauthorized'),
    },
  });

  // --- /me endpoints ----------------------------------------------------

  registry.registerPath({
    method: 'get',
    path: '/me/profile',
    summary: 'Full self-profile (joins role name, includes preferences)',
    tags: ['me'],
    responses: {
      200: jsonOk('Profile', profileResponseSchema),
      401: jsonError('Unauthorized'),
      404: jsonError('User not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/me/profile',
    summary: 'Update own profile fields (partial)',
    tags: ['me'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: profileUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk(
        'Updated profile snapshot',
        z.object({
          id: z.number().int(),
          username: z.string(),
          full_name: z.string(),
          email: z.string().email(),
          mobile: z.string().nullable(),
          bio: z.string().nullable(),
        }),
      ),
      400: jsonError('No fields to update'),
      401: jsonError('Unauthorized'),
      409: jsonError('Email already in use'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/me/preferences',
    summary: 'Update own preferences (theme, locale, notifications, compact mode)',
    tags: ['me'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: preferencesUpdateSchema } },
      },
    },
    responses: {
      200: jsonOk(
        'Updated preferences',
        z.object({
          theme_preference: z.enum(['light', 'dark', 'system']).nullable(),
          locale_preference: z.enum(['en', 'fr']).nullable(),
          email_notifications: z.enum(['Y', 'N']).nullable(),
          compact_mode: z.enum(['Y', 'N']).nullable(),
        }),
      ),
      400: jsonError('No fields to update'),
      401: jsonError('Unauthorized'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/me/password',
    summary: 'Change own password (verifies current_password first)',
    tags: ['me'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: passwordChangeSchema } },
      },
    },
    responses: {
      200: jsonOk('Password updated', z.object({ updated: z.literal(true) })),
      401: jsonError('Unauthorized / current password incorrect'),
      404: jsonError('User not found'),
      422: jsonError('Invalid input'),
    },
  });

  // Multipart file upload — request body uses application/x-www-form-urlencoded
  // here because zod-to-openapi handles object schemas, not raw binary content.
  // The actual route accepts multipart/form-data with a single "file" field.
  const fileUploadSchema = z.object({
    file: z.unknown().describe('binary'),
  });

  registry.registerPath({
    method: 'post',
    path: '/me/avatar',
    summary: 'Upload a new avatar (multipart/form-data; field name "file")',
    tags: ['me'],
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': { schema: fileUploadSchema },
        },
      },
    },
    responses: {
      200: jsonOk('Avatar saved', z.object({ profile_image: z.string() })),
      400: jsonError('No file uploaded'),
      401: jsonError('Unauthorized'),
      413: jsonError('File too large'),
      415: jsonError('Unsupported file type'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/me/avatar',
    summary: 'Remove the current avatar',
    tags: ['me'],
    responses: {
      200: jsonOk('Avatar cleared', z.object({ profile_image: z.null() })),
      401: jsonError('Unauthorized'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/me/signature',
    summary: 'Upload a signature image (multipart/form-data; field name "file")',
    tags: ['me'],
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': { schema: fileUploadSchema },
        },
      },
    },
    responses: {
      200: jsonOk('Signature saved', z.object({ signature_image: z.string() })),
      400: jsonError('No file uploaded'),
      401: jsonError('Unauthorized'),
      413: jsonError('File too large'),
      415: jsonError('Unsupported file type'),
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/me/signature',
    summary: 'Remove the current signature',
    tags: ['me'],
    responses: {
      200: jsonOk('Signature cleared', z.object({ signature_image: z.null() })),
      401: jsonError('Unauthorized'),
    },
  });

  // --- Translate endpoint -----------------------------------------------

  registry.registerPath({
    method: 'post',
    path: '/translate',
    summary: 'Batch-translate up to 200 strings via the configured provider',
    tags: ['translate'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: translateBatchSchema } },
      },
    },
    responses: {
      200: jsonOk(
        'Per-input translations (parallel to the input array)',
        z.object({ translations: z.array(z.string()) }),
      ),
      400: jsonError('Unsupported target locale'),
      422: jsonError('Invalid input'),
    },
  });

  // --- Role-mapping endpoints -------------------------------------------

  const roleIdQuerySchema = z.object({
    role_id: z.string().describe('Positive integer'),
  });

  registry.registerPath({
    method: 'get',
    path: '/role-menu-mapping',
    summary: 'All active menus joined with the queried role mapping',
    tags: ['mappings'],
    request: { query: roleIdQuerySchema },
    responses: {
      200: jsonOk('Per-role menu matrix', roleMenuMappingGetResponseSchema),
      400: jsonError('role_id required / not a positive integer'),
      401: jsonError('Unauthorized'),
      404: jsonError('Role not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/role-menu-mapping',
    summary:
      'Bulk upsert for one role. All-false permission rows are deleted to keep the table clean.',
    tags: ['mappings'],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: roleMenuMappingPutSchema } },
      },
    },
    responses: {
      200: jsonOk(
        'Mapping persisted',
        z.object({
          role_id: z.number().int(),
          saved: z.number().int(),
          removed: z.number().int(),
        }),
      ),
      400: jsonError('Invalid role_id or menu_id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Role not found'),
      422: jsonError('Invalid input'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/role-dashboard-card-mapping',
    summary: 'All active cards joined with the queried role mapping',
    tags: ['mappings'],
    request: { query: roleIdQuerySchema },
    responses: {
      200: jsonOk('Per-role card matrix', roleDashboardCardMappingGetResponseSchema),
      400: jsonError('role_id required / not a positive integer'),
      401: jsonError('Unauthorized'),
      404: jsonError('Role not found'),
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/role-dashboard-card-mapping',
    summary:
      'Bulk upsert for one role. Rows with is_visible=false AND card_order=0 are deleted.',
    tags: ['mappings'],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: roleDashboardCardMappingPutSchema },
        },
      },
    },
    responses: {
      200: jsonOk(
        'Mapping persisted',
        z.object({
          role_id: z.number().int(),
          saved: z.number().int(),
          removed: z.number().int(),
        }),
      ),
      400: jsonError('Invalid role_id or card_id'),
      401: jsonError('Unauthorized'),
      404: jsonError('Role not found'),
      422: jsonError('Invalid input'),
    },
  });

  // --- Generic forms / cases endpoints (§4.3 + §4.5) --------------------
  // Entity-agnostic. Same routes drive every case_template_master_t row:
  // license_default today, invoice_default / payment_request_default later.
  // Response shapes leave the entity column set unspecified (record<unknown>)
  // because target_table columns aren't statically known to the engine.

  const formFieldShape = z.object({
    id: z.number().int(),
    formId: z.number().int(),
    fieldKey: z.string(),
    label: z.string(),
    fieldType: z.string(),
    required: z.boolean(),
    defaultValue: z.string().nullable(),
    helpText: z.string().nullable(),
    validationJson: z.unknown().nullable(),
    optionsJson: z.unknown().nullable(),
    displayOrder: z.number().int(),
    display: z.enum(['Y', 'N']),
  });

  const formDefinitionResponseSchema = z.object({
    id: z.number().int(),
    formKey: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    entityType: z.string(),
    display: z.enum(['Y', 'N']),
    fields: z.array(formFieldShape),
  });

  const transitionShape = z.object({
    id: z.number().int(),
    workflowId: z.number().int(),
    transitionKey: z.string(),
    fromState: z.string(),
    toState: z.string(),
    ruleId: z.number().int().nullable(),
    actionJson: z.unknown().nullable(),
    display: z.enum(['Y', 'N']),
  });

  const caseCreateRequestSchema = z.object({
    values: z.record(z.string(), z.unknown()),
  });

  const caseCreateResponseSchema = z.object({
    caseId: z.number().int(),
    templateKey: z.string(),
    state: z.string(),
  });

  const caseReadResponseSchema = z.object({
    caseId: z.number().int(),
    templateKey: z.string(),
    state: z.string(),
    entity: z.record(z.string(), z.unknown()),
    availableTransitions: z.array(transitionShape),
  });

  const caseAdvanceRequestSchema = z
    .object({ payload: z.record(z.string(), z.unknown()).optional() })
    .optional();

  const sideEffectShape = z.object({
    type: z.literal('notify'),
    channel: z.enum(['email', 'sms', 'in_app']),
    to: z.unknown(),
    template: z.string(),
  });

  const caseAdvanceResponseSchema = z.object({
    caseId: z.number().int(),
    templateKey: z.string(),
    workflowKey: z.string(),
    transitionKey: z.string(),
    previousState: z.string(),
    newState: z.string(),
    sideEffects: z.array(sideEffectShape),
  });

  registry.register('FormDefinitionResponse', formDefinitionResponseSchema);
  registry.register('CaseCreateInput', caseCreateRequestSchema);
  registry.register('CaseCreateResponse', caseCreateResponseSchema);
  registry.register('CaseReadResponse', caseReadResponseSchema);
  registry.register('CaseAdvanceResponse', caseAdvanceResponseSchema);

  const formKeyParam = z.object({ formKey: z.string() });
  const caseParams = z.object({ templateKey: z.string(), caseId: z.string() });
  const caseAdvanceParams = z.object({
    templateKey: z.string(),
    caseId: z.string(),
    transitionKey: z.string(),
  });

  registry.registerPath({
    method: 'get',
    path: '/forms/{formKey}',
    summary: 'Form definition + ordered fields for client-side rendering',
    tags: ['forms'],
    request: { params: formKeyParam },
    responses: {
      200: jsonOk('Form definition', formDefinitionResponseSchema),
      401: jsonError('Unauthorized'),
      404: jsonError('Form not found'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/cases/{templateKey}',
    summary:
      'Create a case via case_template_master_t. Validates the body against the form definition.',
    tags: ['cases'],
    request: {
      params: z.object({ templateKey: z.string() }),
      body: {
        required: true,
        content: { 'application/json': { schema: caseCreateRequestSchema } },
      },
    },
    responses: {
      201: jsonOk('Created', caseCreateResponseSchema),
      401: jsonError('Unauthorized'),
      404: jsonError('Template / form / workflow not found'),
      422: jsonError('Body or form values failed validation'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/cases/{templateKey}/{caseId}',
    summary:
      'Read a case row from its target_table plus transitions available from the current state',
    tags: ['cases'],
    request: { params: caseParams },
    responses: {
      200: jsonOk('Case + available transitions', caseReadResponseSchema),
      400: jsonError('Invalid caseId / entity missing string state column'),
      401: jsonError('Unauthorized'),
      404: jsonError('Template or case not found'),
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/cases/{templateKey}/{caseId}/transitions/{transitionKey}',
    summary:
      'Apply a workflow transition. Rule gate + action_json executed inside a transaction.',
    tags: ['cases'],
    request: {
      params: caseAdvanceParams,
      body: {
        required: false,
        content: { 'application/json': { schema: caseAdvanceRequestSchema } },
      },
    },
    responses: {
      200: jsonOk('Transition applied', caseAdvanceResponseSchema),
      400: jsonError('Invalid caseId / entity missing string state column'),
      401: jsonError('Unauthorized'),
      403: jsonError('Rule gate denied (e.g. license.no_self_approve)'),
      404: jsonError('Template / case / transition not found'),
      409: jsonError("Entity's current state doesn't match transition.from_state"),
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
