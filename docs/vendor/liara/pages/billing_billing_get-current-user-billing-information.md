> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get current user billing information

> Returns the current user's balance and billing configuration.



## OpenAPI

````yaml /spec/billing.yaml get /v1/billing
openapi: 3.0.1
info:
  title: Liara Billing API
  version: 1.0.0
  description: Retrieve current user billing information.
servers:
  - url: https://api.liara.ir
security:
  - bearerAuth: []
tags:
  - name: Billing
paths:
  /v1/billing:
    get:
      tags:
        - Billing
      summary: Get current user billing information
      description: Returns the current user's balance and billing configuration.
      operationId: getBilling
      responses:
        '200':
          description: Current user billing information
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BillingResponse'
        '401':
          description: Unauthorized
components:
  schemas:
    BillingResponse:
      type: object
      properties:
        user:
          $ref: '#/components/schemas/BillingUser'
    BillingUser:
      type: object
      properties:
        balance:
          type: number
          format: double
          description: Current account balance
        accountType:
          type: string
          description: Account type
        minCreditAmount:
          type: integer
          description: Minimum credit amount
        isManualMinCredit:
          type: boolean
          description: Indicates whether minimum credit is manually configured
        minCreditLastNotifiedAt:
          type: string
          format: date-time
          nullable: true
          description: Last minimum credit notification time
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.