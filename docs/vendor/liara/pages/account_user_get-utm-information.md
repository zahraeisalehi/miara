> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get UTM information

> Returns the UTM campaign the account joined through, or null if none.



## OpenAPI

````yaml /spec/me.yaml get /v1/me/utm
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
  /v1/me/utm:
    get:
      tags:
        - User
      summary: Get UTM information
      description: Returns the UTM campaign the account joined through, or null if none.
      operationId: getMeUTM
      responses:
        '200':
          description: UTM information
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeUTMResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeUTMResponse:
      type: object
      properties:
        utm:
          $ref: '#/components/schemas/UTM'
    UTM:
      type: object
      nullable: true
      properties:
        _id:
          type: string
        source:
          type: string
        medium:
          type: string
        campaign:
          type: string
        freeCreditAmount:
          type: number
        allowedServices:
          type: array
          items:
            type: string
        joinedAt:
          type: string
          format: date-time
          nullable: true
        expiresAt:
          type: string
          format: date-time
          nullable: true
        isActive:
          type: boolean
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.