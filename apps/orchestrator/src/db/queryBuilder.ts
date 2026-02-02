/**
 * Query builder utilities for constructing dynamic SQL queries.
 *
 * Provides a fluent interface for building WHERE clauses with proper
 * parameter binding to prevent SQL injection.
 */

/**
 * Result from building a filter query
 */
export interface FilterResult {
  /** WHERE clause (empty string if no conditions) */
  whereClause: string;
  /** Ordered parameter values for binding */
  params: unknown[];
}

/**
 * Fluent builder for constructing dynamic WHERE clauses.
 *
 * @example
 * const filter = new FilterBuilder()
 *   .equals('status', 'active')
 *   .equals('server_id', serverId, serverId !== undefined)
 *   .like('name', `%${search}%`, search !== undefined)
 *   .build();
 *
 * db.prepare(`SELECT * FROM deployments ${filter.whereClause}`).all(...filter.params);
 */
export class FilterBuilder {
  private conditions: string[] = [];
  private params: unknown[] = [];

  /**
   * Add an equality condition: field = ?
   * @param field Column name
   * @param value Value to match
   * @param condition Optional condition - only adds if true (default: true)
   */
  equals(field: string, value: unknown, condition: boolean = true): this {
    if (condition && value !== undefined) {
      this.conditions.push(`${field} = ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add a not-equals condition: field != ?
   */
  notEquals(field: string, value: unknown, condition: boolean = true): this {
    if (condition && value !== undefined) {
      this.conditions.push(`${field} != ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add a LIKE condition: field LIKE ?
   * @param field Column name
   * @param pattern LIKE pattern (caller should include % wildcards)
   * @param condition Optional condition - only adds if true
   */
  like(field: string, pattern: string, condition: boolean = true): this {
    if (condition && pattern) {
      this.conditions.push(`${field} LIKE ?`);
      this.params.push(pattern);
    }
    return this;
  }

  /**
   * Add an IN condition: field IN (?, ?, ...)
   * @param field Column name
   * @param values Array of values to match
   * @param condition Optional condition - only adds if true
   */
  in(field: string, values: unknown[], condition: boolean = true): this {
    if (condition && values && values.length > 0) {
      const placeholders = values.map(() => '?').join(', ');
      this.conditions.push(`${field} IN (${placeholders})`);
      this.params.push(...values);
    }
    return this;
  }

  /**
   * Add a NOT IN condition: field NOT IN (?, ?, ...)
   */
  notIn(field: string, values: unknown[], condition: boolean = true): this {
    if (condition && values && values.length > 0) {
      const placeholders = values.map(() => '?').join(', ');
      this.conditions.push(`${field} NOT IN (${placeholders})`);
      this.params.push(...values);
    }
    return this;
  }

  /**
   * Add a comparison condition: field > ?, field >= ?, field < ?, field <= ?
   */
  compare(field: string, operator: '>' | '>=' | '<' | '<=', value: unknown, condition: boolean = true): this {
    if (condition && value !== undefined) {
      this.conditions.push(`${field} ${operator} ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add a BETWEEN condition: field BETWEEN ? AND ?
   */
  between(field: string, min: unknown, max: unknown, condition: boolean = true): this {
    if (condition && min !== undefined && max !== undefined) {
      this.conditions.push(`${field} BETWEEN ? AND ?`);
      this.params.push(min, max);
    }
    return this;
  }

  /**
   * Add an IS NULL condition: field IS NULL
   */
  isNull(field: string, condition: boolean = true): this {
    if (condition) {
      this.conditions.push(`${field} IS NULL`);
    }
    return this;
  }

  /**
   * Add an IS NOT NULL condition: field IS NOT NULL
   */
  isNotNull(field: string, condition: boolean = true): this {
    if (condition) {
      this.conditions.push(`${field} IS NOT NULL`);
    }
    return this;
  }

  /**
   * Add a raw condition with parameters.
   * Use with caution - ensure field names are not from user input.
   * @param sql Raw SQL condition (e.g., "created_at > datetime('now', '-1 day')")
   * @param params Parameters for the condition
   */
  raw(sql: string, params: unknown[] = [], condition: boolean = true): this {
    if (condition) {
      this.conditions.push(sql);
      this.params.push(...params);
    }
    return this;
  }

  /**
   * Check if any conditions have been added
   */
  hasConditions(): boolean {
    return this.conditions.length > 0;
  }

  /**
   * Get the number of conditions
   */
  get conditionCount(): number {
    return this.conditions.length;
  }

  /**
   * Build the WHERE clause and parameters.
   * Returns empty whereClause if no conditions were added.
   */
  build(): FilterResult {
    if (this.conditions.length === 0) {
      return { whereClause: '', params: [] };
    }
    return {
      whereClause: `WHERE ${this.conditions.join(' AND ')}`,
      params: [...this.params],
    };
  }

  /**
   * Build just the conditions part (without "WHERE").
   * Useful for combining with existing WHERE clauses.
   */
  buildConditions(): FilterResult {
    if (this.conditions.length === 0) {
      return { whereClause: '', params: [] };
    }
    return {
      whereClause: this.conditions.join(' AND '),
      params: [...this.params],
    };
  }
}

/**
 * Create a new FilterBuilder instance.
 * Convenience function for method chaining without `new`.
 *
 * @example
 * const { whereClause, params } = filter()
 *   .equals('status', 'running')
 *   .build();
 */
export function filter(): FilterBuilder {
  return new FilterBuilder();
}

/**
 * Builder for constructing UPDATE SET clauses.
 *
 * @example
 * const update = new UpdateBuilder()
 *   .set('name', name, name !== undefined)
 *   .set('status', status)
 *   .setRaw('updated_at', 'CURRENT_TIMESTAMP')
 *   .build();
 *
 * if (update.hasUpdates) {
 *   db.prepare(`UPDATE servers SET ${update.setClause} WHERE id = ?`)
 *     .run(...update.params, id);
 * }
 */
export class UpdateBuilder {
  private fields: string[] = [];
  private params: unknown[] = [];

  /**
   * Add a field to update: field = ?
   * @param field Column name
   * @param value Value to set
   * @param condition Optional condition - only adds if true
   */
  set(field: string, value: unknown, condition: boolean = true): this {
    if (condition && value !== undefined) {
      this.fields.push(`${field} = ?`);
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add a raw field update without parameter binding.
   * Use for SQL functions like CURRENT_TIMESTAMP.
   * @param field Column name
   * @param rawValue Raw SQL value (e.g., 'CURRENT_TIMESTAMP')
   */
  setRaw(field: string, rawValue: string, condition: boolean = true): this {
    if (condition) {
      this.fields.push(`${field} = ${rawValue}`);
    }
    return this;
  }

  /**
   * Check if any fields have been added
   */
  get hasUpdates(): boolean {
    return this.fields.length > 0;
  }

  /**
   * Build the SET clause and parameters
   */
  build(): { setClause: string; params: unknown[]; hasUpdates: boolean } {
    return {
      setClause: this.fields.join(', '),
      params: [...this.params],
      hasUpdates: this.fields.length > 0,
    };
  }
}

/**
 * Create a new UpdateBuilder instance.
 */
export function update(): UpdateBuilder {
  return new UpdateBuilder();
}
