> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Git integrations

> Returns the connected Git providers and their repository integrations.



## OpenAPI

````yaml /spec/me.yaml get /v1/me/git-integrations
openapi: 3.0.1
info:
  title: Liara Account API
  version: 1.0.0
  description: Retrieve current authenticated user and console information.
servers:
  - url: https://api.liara.ir
security: []
tags:
  - name: User
paths:
  /v1/me/git-integrations:
    get:
      tags:
        - User
      summary: Get Git integrations
      description: Returns the connected Git providers and their repository integrations.
      operationId: getMeGitIntegrations
      responses:
        '200':
          description: Git integrations
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeGitIntegrationsResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeGitIntegrationsResponse:
      type: object
      properties:
        gitProviderIntegrations:
          type: array
          items:
            $ref: '#/components/schemas/GitProviderIntegration'
        gitRepositoryIntegrations:
          type: array
          items:
            $ref: '#/components/schemas/GitRepositoryIntegration'
    GitProviderIntegration:
      type: object
    GitRepositoryIntegration:
      type: object
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.