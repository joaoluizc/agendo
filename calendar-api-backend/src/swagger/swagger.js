import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

const swaggerOptions = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Agendo API',
      version: '0.1.0',
    },
    components: {
      securitySchemes: {
        /**
         * This shows up in Swagger UI’s “Authorize” modal.
         * UI will prepend “Bearer ” automatically.
         */
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',   // purely cosmetic
        },
      },
    },

    /** If you want *every* endpoint protected by default */
    security: [{ BearerAuth: [] }],
  },
  // Globs covering all files that contain @openapi blocks
  apis: ['./src/routers/**/*.js', './src/controllers/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export const mountSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};