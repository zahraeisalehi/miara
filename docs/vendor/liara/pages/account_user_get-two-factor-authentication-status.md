> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get two-factor authentication status

> Returns the two-factor authentication status of the user. Both fields are omitted for teams.



## OpenAPI

````yaml /spec/me.yaml get /v1/me/two-fa
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
  /v1/me/two-fa:
    get:
      tags:
        - User
      summary: Get two-factor authentication status
      description: >-
        Returns the two-factor authentication status of the user. Both fields
        are omitted for teams.
      operationId: getMeTwoFA
      responses:
        '200':
          description: Two-factor authentication status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeTwoFAResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeTwoFAResponse:
      type: object
      properties:
        twoFA:
          type: boolean
        lastTwoFAVerifiedAt:
          type: string
          format: date-time
          nullable: true
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.