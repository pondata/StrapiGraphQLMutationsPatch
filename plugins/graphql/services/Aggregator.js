module.exports = {
  /**
   * Build the mongoose aggregator by applying the filters
   */
  getModelAggregator: function(model, filters = {}) {
    const aggregation = model.aggregate();
    if (!_.isEmpty(filters.where)) {
      aggregation.match(filters.where);
    }
    if (filters.limit) {
      aggregation.limit(filters.limit);
    }
    return aggregation;
  },

  /**
   * Create the resolvers for each aggregation field
   *
   * @return {Object}
   *
   * @example
   *
   * const model = // Strapi model
   *
   * const fields = {
   *   username: String,
   *   age: Int,
   * }
   *
   * const typeCheck = (type) => type === 'Int' || type === 'Float',
   *
   * const fieldsResoler = createAggregationFieldsResolver(model, fields, 'sum', typeCheck);
   *
   * // => {
   *   age: function ageResolver() { .... }
   * }
   */
  createAggregationFieldsResolver: function(
    model,
    fields,
    operation,
    typeCheck,
  ) {
    return this.createFieldsResolver(
      fields,
      async (obj, options, context, fieldResolver, fieldKey) => {
        // eslint-disable-line no-unused-vars
        const result = await this.getModelAggregator(model, obj).group({
          _id: null,
          [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
        });
        return _.get(result, `0.${fieldKey}`);
      },
      typeCheck,
    );
  },

  /**
   * Correctly format the data returned by the group by
   */
  preProcessGroupByData: function({ result, fieldKey, filters, modelName }) {
    const _result = _.toArray(result);
    return _.map(_result, value => {
      const params = Object.assign(
        {},
        this.convertToParams(_.omit(filters, 'where')),
        filters.where,
        {
          [fieldKey]: value._id,
        },
      );

      return {
        key: value._id,
        connection: strapi.utils.models.convertParams(modelName, params),
      };
    });
  },

  /**
   * Create the resolvers for each group by field
   *
   * @return {Object}
   *
   * @example
   *
   * const model = // Strapi model
   * const fields = {
   *   username: [UserConnectionUsername],
   *   email: [UserConnectionEmail],
   * }
   * const fieldsResoler = createGroupByFieldsResolver(model, fields);
   *
   * // => {
   *   username: function usernameResolver() { .... }
   *   email: function emailResolver() { .... }
   * }
   */
  createGroupByFieldsResolver: function(model, fields, name) {
    return this.createFieldsResolver(
      fields,
      async (obj, options, context, fieldResolver, fieldKey) => {
        const result = await this.getModelAggregator(model, obj).group({
          _id: `$${fieldKey}`,
        });

        return this.preProcessGroupByData({
          result,
          fieldKey,
          filters: obj,
          modelName: name,
        });
      },
      () => true,
    );
  },

  /**
   * This method is the entry point to the GraphQL's Aggregation.
   * It takes as param the model and its fields and it'll create the aggregation types and resolver to it
   * Example:
   *  type User {
   *     username: String,
   *     age: Int,
   *  }
   *
   * It'll create
   *  type UserConnection {
   *    values: [User],
   *    groupBy: UserGroupBy,
   *    aggreate: UserAggregate
   *  }
   *
   *  type UserAggregate {
   *     count: Int
   *     sum: UserAggregateSum
   *     avg: UserAggregateAvg
   *  }
   *
   *  type UserAggregateSum {
   *     age: Float
   *  }
   *
   *  type UserAggregateAvg {
   *    age: Float
   *  }
   *
   *  type UserGroupBy {
   *     username: [UserConnectionUsername]
   *     age: [UserConnectionAge]
   *  }
   *
   *  type UserConnectionUsername {
   *    key: String
   *    connection: UserConnection
   *  }
   *
   *  type UserConnectionAge {
   *    key: Int
   *    connection: UserConnection
   *  }
   *
   */
  formatModelConnectionsGQL: function(fields, model, name, modelResolver) {
    const { globalId } = model;

    const connectionGlobalId = `${globalId}Connection`;
    const aggregatorFormat = this.formatConnectionAggregator(
      fields,
      model,
      name,
    );
    const groupByFormat = this.formatConnectionGroupBy(fields, model, name);
    const connectionFields = {
      values: `[${globalId}]`,
      groupBy: `${globalId}GroupBy`,
      aggregate: `${globalId}Aggregator`,
    };

    let modelConnectionTypes = `type ${connectionGlobalId} {${this.formatGQL(
      connectionFields,
    )}}\n\n`;
    if (aggregatorFormat) {
      modelConnectionTypes += aggregatorFormat.type;
    }
    modelConnectionTypes += groupByFormat.type;

    return {
      globalId: connectionGlobalId,
      type: modelConnectionTypes,
      query: {
        [`${pluralize.plural(
          name,
        )}Connection(sort: String, limit: Int, start: Int, where: JSON)`]: connectionGlobalId,
      },
      resolver: {
        Query: {
          [`${pluralize.plural(name)}Connection`]: (obj, options, context) => {
            // eslint-disable-line no-unused-vars
            const params = Object.assign(
              {},
              this.convertToParams(_.omit(options, 'where')),
              options.where,
            );
            return strapi.utils.models.convertParams(name, params);
          },
        },
        [connectionGlobalId]: {
          values: (obj, option, context) => {
            // Object here contains the key/value of the field that has been grouped-by
            // for instance obj = { where: { country: 'USA' } } so the values here needs to be filtered according to the parent value
            return modelResolver(obj, obj, context);
          },
          groupBy: (obj, option, context) => {
            // eslint-disable-line no-unused-vars
            // There is noting to resolve here, it's the aggregation resolver that will take care of it
            return obj;
          },
          aggregate: (obj, option, context) => {
            // eslint-disable-line no-unused-vars
            // There is noting to resolve here, it's the aggregation resolver that will take care of it
            return obj;
          },
        },
        ...aggregatorFormat.resolver,
        ...groupByFormat.resolver,
      },
    };
  },

  /**
   * Generate the connection type of each non-array field of the model
   *
   * @return {String}
   */
  generateConnectionFieldsTypes: function(fields, model) {
    const { globalId, attributes } = model;
    const primitiveFields = this.getFieldsByTypes(
      fields,
      this.isNotOfTypeArray,
      (type, name) => this.extractType(type, (attributes[name] || {}).type),
    );

    const connectionFields = _.mapValues(primitiveFields, fieldType => ({
      key: fieldType,
      connection: `${globalId}Connection`,
    }));

    return Object.keys(primitiveFields)
      .map(
        fieldKey =>
          `type ${globalId}Connection${_.upperFirst(
            fieldKey,
          )} {${this.formatGQL(connectionFields[fieldKey])}}`,
      )
      .join('\n\n');
  },

  formatConnectionGroupBy: function(fields, model, name) {
    const { globalId } = model;
    const groupByGlobalId = `${globalId}GroupBy`;

    // Extract all primitive fields and change their types
    const groupByFields = this.getFieldsByTypes(
      fields,
      this.isNotOfTypeArray,
      (fieldType, fieldName) =>
        `[${globalId}Connection${_.upperFirst(fieldName)}]`,
    );

    // Get the generated field types
    let groupByTypes = `type ${groupByGlobalId} {${this.formatGQL(
      groupByFields,
    )}}\n\n`;
    groupByTypes += this.generateConnectionFieldsTypes(fields, model);

    return {
      globalId: groupByGlobalId,
      type: groupByTypes,
      resolver: {
        [groupByGlobalId]: this.createGroupByFieldsResolver(
          model,
          groupByFields,
          name,
        ),
      },
    };
  },

  formatConnectionAggregator: function(fields, model) {
    const { globalId } = model;

    // Extract all fields of type Integer and Float and change their type to Float
    const numericFields = this.getFieldsByTypes(
      fields,
      this.isNumberType,
      () => 'Float',
    );

    // Don't create an aggregator field if the model has not number fields
    const aggregatorGlobalId = `${globalId}Aggregator`;
    const initialFields = {
      count: 'Int',
    };

    // Only add the aggregator's operations if there are some numeric fields
    if (!_.isEmpty(numericFields)) {
      ['sum', 'avg', 'min', 'max'].forEach(agg => {
        initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
      });
    }

    const gqlNumberFormat = this.formatGQL(numericFields);
    let aggregatorTypes = `type ${aggregatorGlobalId} {${this.formatGQL(
      initialFields,
    )}}\n\n`;

    let resolvers = {
      [aggregatorGlobalId]: {
        count: async (obj, options, context) => {
          // eslint-disable-line no-unused-vars
          // Object here corresponds to the filter that needs to be applied to the aggregation
          const result = await this.getModelAggregator(model, obj).group({
            _id: null,
            count: { $sum: 1 },
          });

          return _.get(result, '0.count');
        },
      },
    };

    // Only add the aggregator's operations types and resolver if there are some numeric fields
    if (!_.isEmpty(numericFields)) {
      // Returns the actual object and handle aggregation in the query resolvers
      const defaultAggregatorFunc = (obj, options, context) => {
        // eslint-disable-line no-unused-vars
        return obj;
      };

      aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
      aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
      aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
      aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

      _.merge(resolvers[aggregatorGlobalId], {
        sum: defaultAggregatorFunc,
        avg: defaultAggregatorFunc,
        min: defaultAggregatorFunc,
        max: defaultAggregatorFunc,
      });

      resolvers = {
        ...resolvers,
        [`${aggregatorGlobalId}Sum`]: this.createAggregationFieldsResolver(
          model,
          fields,
          'sum',
          this.isNumberType,
        ),
        [`${aggregatorGlobalId}Avg`]: this.createAggregationFieldsResolver(
          model,
          fields,
          'avg',
          this.isNumberType,
        ),
        [`${aggregatorGlobalId}Min`]: this.createAggregationFieldsResolver(
          model,
          fields,
          'min',
          this.isNumberType,
        ),
        [`${aggregatorGlobalId}Max`]: this.createAggregationFieldsResolver(
          model,
          fields,
          'max',
          this.isNumberType,
        ),
      };
    }

    return {
      globalId: aggregatorGlobalId,
      type: aggregatorTypes,
      resolver: resolvers,
    };
  },
};
