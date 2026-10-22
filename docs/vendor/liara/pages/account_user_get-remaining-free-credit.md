> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get remaining free credit

> Returns the remaining free credit of the user. The field is omitted for teams.



## OpenAPI

````yaml /spec/me.yaml get /v1/me/free-credit
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
  /v1/me/free-credit:
    get:
      tags:
        - User
      summary: Get remaining free credit
      description: >-
        Returns the remaining free credit of the user. The field is omitted for
        teams.
      operationId: getMeFreeCredit
      responses:
        '200':
          description: Remaining free credit
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeFreeCreditResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeFreeCreditResponse:
      type: object
      properties:
        remainingFreeCredit:
          type: number
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.