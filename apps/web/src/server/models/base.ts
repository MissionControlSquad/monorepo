import { notDeleted } from "@agentcenter/database";

// ─── Utility types ───────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

/**
 * The base model type `T` plus an index signature so callers can access
 * included relations without casting.  Known fields keep their types
 * (with autocomplete); unknown fields resolve to `any`.
 */
type WithRelations<T> = T & Record<string, any>;

// ─── Types ────────────────────────────────────────────────────────────

export interface ModelHooks<T> {
  beforeCreate?: (data: AnyRecord) => AnyRecord | Promise<AnyRecord>;
  afterCreate?: (record: T) => void | Promise<void>;
  beforeUpdate?: (id: string, data: AnyRecord) => AnyRecord | Promise<AnyRecord>;
  afterUpdate?: (record: T) => void | Promise<void>;
  beforeDelete?: (id: string) => void | Promise<void>;
  afterDelete?: (id: string) => void | Promise<void>;
}

export interface ModelOptions<T> {
  softDelete?: boolean;
  hooks?: ModelHooks<T>;
}

export interface FindByIdArgs {
  include?: AnyRecord;
  select?: AnyRecord;
}

export interface FindOneArgs {
  where?: AnyRecord;
  include?: AnyRecord;
  select?: AnyRecord;
  orderBy?: AnyRecord | AnyRecord[];
}

export interface FindManyArgs {
  where?: AnyRecord;
  include?: AnyRecord;
  select?: AnyRecord;
  orderBy?: AnyRecord | AnyRecord[];
  skip?: number;
  take?: number;
  cursor?: AnyRecord;
  distinct?: string[];
}

export interface CreateRecordArgs {
  data: AnyRecord;
  include?: AnyRecord;
  select?: AnyRecord;
}

export interface UpdateRecordArgs {
  data: AnyRecord;
  include?: AnyRecord;
  select?: AnyRecord;
  where?: AnyRecord;
}

export interface UpsertArgs {
  where: AnyRecord;
  create: AnyRecord;
  update: AnyRecord;
  include?: AnyRecord;
  select?: AnyRecord;
}

export interface UpdateManyArgs {
  where?: AnyRecord;
  data: AnyRecord;
}

export interface CreateManyArgs {
  data: AnyRecord[];
  skipDuplicates?: boolean;
}

export interface PageArgs {
  where?: AnyRecord;
  orderBy?: AnyRecord | AnyRecord[];
  include?: AnyRecord;
  select?: AnyRecord;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Minimal shape that all Prisma delegates satisfy. */
interface PrismaDelegate {
  findFirst(args?: any): Promise<any>;
  findUnique(args?: any): Promise<any>;
  findUniqueOrThrow(args?: any): Promise<any>;
  findMany(args?: any): Promise<any[]>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<any>;
  createMany(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  upsert(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  deleteMany(args?: any): Promise<any>;
  groupBy(args?: any): Promise<any>;
  aggregate(args?: any): Promise<any>;
}

// ─── Model class ─────────────────────────────────────────────────────

/**
 * Generic model wrapper around a Prisma delegate.
 *
 * Provides standard CRUD operations with optional soft-delete filtering
 * and before/after hooks.  `T` is the plain Prisma model type
 * (e.g. `Agent`, `Task`).
 *
 * Simple models instantiate directly:
 *   const agentModel = new Model<Agent>(() => prisma.agent);
 *
 * Complex models extend and override with Prisma-specific types:
 *   class TaskModel extends Model<Task> { ... }
 */
export class Model<T> {
  protected useSoftDelete: boolean;
  protected hooks: ModelHooks<T>;

  constructor(
    protected delegateGetter: () => PrismaDelegate,
    options: ModelOptions<T> = {},
  ) {
    this.useSoftDelete = options.softDelete ?? false;
    this.hooks = options.hooks ?? {};
  }

  /** Raw Prisma delegate for escape-hatch queries. */
  get delegate(): PrismaDelegate {
    return this.delegateGetter();
  }

  /** Merge soft-delete filter into a where clause when enabled. */
  protected withSoftDelete(where?: AnyRecord): AnyRecord | undefined {
    return this.useSoftDelete ? { ...where, ...notDeleted } : where;
  }

  // ── Read ──────────────────────────────────────────────────────────

  /**
   * Find a single record by ID.
   * Uses `findFirst` (not `findUnique`) so compound where clauses
   * work correctly with soft-delete filtering.
   */
  findById(id: string, args: FindByIdArgs = {}): Promise<WithRelations<T> | null> {
    if (this.useSoftDelete) {
      return this.delegateGetter().findFirst({
        ...args,
        where: { id, ...notDeleted },
      });
    }
    return this.delegateGetter().findUnique({ ...args, where: { id } });
  }

  /** Find a single record matching arbitrary criteria. */
  findOne(args: FindOneArgs = {}): Promise<WithRelations<T> | null> {
    return this.delegateGetter().findFirst({
      ...args,
      where: this.withSoftDelete(args.where),
    });
  }

  /** Find many records, auto-excluding soft-deleted rows. */
  findMany(args: FindManyArgs = {}): Promise<WithRelations<T>[]> {
    return this.delegateGetter().findMany({
      ...args,
      where: this.withSoftDelete(args.where),
    });
  }

  /** Offset-based pagination. */
  async page(args: PageArgs = {}): Promise<PageResult<WithRelations<T>>> {
    const { where, orderBy, include, select, page = 1, pageSize = 20 } = args;
    const filteredWhere = this.withSoftDelete(where);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.delegateGetter().findMany({
        where: filteredWhere,
        orderBy,
        include,
        select,
        skip,
        take: pageSize,
      }),
      this.delegateGetter().count({ where: filteredWhere }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Count records, auto-excluding soft-deleted rows. */
  count(args: { where?: AnyRecord } = {}): Promise<number> {
    return this.delegateGetter().count({
      ...args,
      where: this.withSoftDelete(args.where),
    });
  }

  /**
   * Find a single record by ID, throwing if not found.
   * Respects soft-delete filtering.
   */
  async findByIdOrThrow(id: string, args: FindByIdArgs = {}): Promise<WithRelations<T>> {
    const record = await this.findById(id, args);
    if (!record) {
      throw new Error(`Record with id "${id}" not found`);
    }
    return record;
  }

  // ── Write ─────────────────────────────────────────────────────────

  /** Create a new record. */
  async create(args: CreateRecordArgs): Promise<WithRelations<T>> {
    let finalArgs = args;
    if (this.hooks.beforeCreate) {
      finalArgs = { ...args, data: await this.hooks.beforeCreate(args.data) };
    }
    const record = await this.delegateGetter().create(finalArgs);
    if (this.hooks.afterCreate) await this.hooks.afterCreate(record);
    return record;
  }

  /** Upsert a record. */
  async upsert(args: UpsertArgs): Promise<WithRelations<T>> {
    return this.delegateGetter().upsert(args);
  }

  /** Update many records matching a where clause. */
  updateMany(args: UpdateManyArgs): Promise<{ count: number }> {
    return this.delegateGetter().updateMany(args);
  }

  /** Create many records. */
  createMany(args: CreateManyArgs): Promise<{ count: number }> {
    return this.delegateGetter().createMany(args);
  }

  /** Update a record by ID. */
  async update(id: string, args: UpdateRecordArgs): Promise<WithRelations<T>> {
    let finalArgs = args;
    if (this.hooks.beforeUpdate) {
      finalArgs = {
        ...args,
        data: await this.hooks.beforeUpdate(id, args.data),
      };
    }
    const record = await this.delegateGetter().update({
      ...finalArgs,
      where: { id, ...finalArgs.where },
    });
    if (this.hooks.afterUpdate) await this.hooks.afterUpdate(record);
    return record;
  }

  /** Delete a record by ID (hard delete). */
  async deleteById(id: string): Promise<T> {
    if (this.hooks.beforeDelete) await this.hooks.beforeDelete(id);
    const record = await this.delegateGetter().delete({ where: { id } });
    if (this.hooks.afterDelete) await this.hooks.afterDelete(id);
    return record;
  }

  /** Delete many records matching a where clause. */
  deleteMany(args: { where?: AnyRecord } = {}): Promise<{ count: number }> {
    return this.delegateGetter().deleteMany(args);
  }
}
