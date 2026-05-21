import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  loginSchema,
  passwordChangeSchema,
  preferencesUpdateSchema,
  profileUpdateSchema,
  translateBatchSchema,
  userCreateSchema,
  userUpdateSchema,
  userListQuerySchema,
  menuCreateSchema,
  menuUpdateSchema,
  roleCreateSchema,
  roleUpdateSchema,
  dashboardCardCreateSchema,
  dashboardCardUpdateSchema,
  roleMenuMappingPutSchema,
  roleDashboardCardMappingPutSchema,
} from '@/schemas';

// OpenAPI generation per root CLAUDE.md §4.4 — the Zod schemas in
// src/schemas/ are the source of truth for both runtime validation and
// the published API contract. Routes are intentionally not registered
// yet — each route handler will need an OpenAPI annotation pass (params,
// responses, status codes) which is a separate slice from "extract the
// schemas the routes already use".

// Mutates ZodType.prototype so registry.register() can attach refIds via
// .openapi(). Safe to call repeatedly — the lib no-ops a second extension.
let extended = false;
function ensureExtended(): void {
  if (extended) return;
  extendZodWithOpenApi(z);
  extended = true;
}

function buildRegistry(): OpenAPIRegistry {
  ensureExtended();
  const registry = new OpenAPIRegistry();

  registry.register('LoginInput', loginSchema);
  registry.register('PasswordChangeInput', passwordChangeSchema);
  registry.register('PreferencesUpdateInput', preferencesUpdateSchema);
  registry.register('ProfileUpdateInput', profileUpdateSchema);
  registry.register('TranslateBatchInput', translateBatchSchema);
  registry.register('UserCreateInput', userCreateSchema);
  registry.register('UserUpdateInput', userUpdateSchema);
  registry.register('UserListQuery', userListQuerySchema);
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
