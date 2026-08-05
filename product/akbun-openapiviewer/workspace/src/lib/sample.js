// A small sample so the empty page has something to click. JSON, because that
// is also the format most people paste.
export const SAMPLE_SPEC = JSON.stringify(
  {
    openapi: '3.0.3',
    info: {
      title: 'Petstore Sample',
      version: '1.0.0',
      description: 'A small sample spec bundled with the viewer.',
    },
    paths: {
      '/pets': {
        get: {
          tags: ['pets'],
          operationId: 'listPets',
          summary: 'List all pets',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'How many pets to return at most',
              schema: { type: 'integer', format: 'int32' },
            },
          ],
          responses: {
            200: {
              description: 'A list of pets',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
                },
              },
            },
            default: {
              description: 'Unexpected error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        post: {
          tags: ['pets'],
          operationId: 'createPet',
          summary: 'Create a pet',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
          responses: {
            201: {
              description: 'The created pet',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
      '/pets/{petId}': {
        parameters: [
          {
            name: 'petId',
            in: 'path',
            required: true,
            description: 'The id of the pet',
            schema: { type: 'integer', format: 'int64' },
          },
        ],
        get: {
          tags: ['pets'],
          operationId: 'getPet',
          summary: 'Get a pet by id',
          responses: {
            200: {
              description: 'The pet',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
            404: {
              description: 'No such pet',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
        delete: {
          tags: ['pets'],
          operationId: 'deletePet',
          summary: 'Delete a pet',
          responses: { 204: { description: 'Deleted' } },
        },
      },
      '/orders': {
        get: {
          tags: ['orders'],
          operationId: 'listOrders',
          summary: 'List orders',
          responses: {
            200: {
              description: 'A list of orders',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                },
              },
            },
          },
        },
        post: {
          tags: ['orders'],
          operationId: 'createOrder',
          summary: 'Place an order',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
          responses: {
            201: {
              description: 'The placed order',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
            },
          },
        },
      },
      '/orders/{orderId}': {
        get: {
          tags: ['orders'],
          operationId: 'getOrder',
          summary: 'Get an order by id',
          parameters: [
            {
              name: 'orderId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'The order',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'integer', format: 'int64' },
            name: { type: 'string' },
            tag: { type: 'string' },
            status: { type: 'string', enum: ['available', 'pending', 'sold'] },
          },
        },
        Order: {
          type: 'object',
          required: ['id', 'pet'],
          properties: {
            id: { type: 'string' },
            pet: { $ref: '#/components/schemas/Pet' },
            quantity: { type: 'integer', format: 'int32' },
            shipDate: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'integer', format: 'int32' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  null,
  2,
);
