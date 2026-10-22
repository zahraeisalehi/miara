> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get current subscription plan

> Returns the current subscription plan of the user (or the team in team mode). Returns an empty object when there is no active plan.



## OpenAPI

````yaml /spec/me.yaml get /v1/me/subscription
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
  /v1/me/subscription:
    get:
      tags:
        - User
      summary: Get current subscription plan
      description: >-
        Returns the current subscription plan of the user (or the team in team
        mode). Returns an empty object when there is no active plan.
      operationId: getMeSubscription
      responses:
        '200':
          description: Current subscription plan
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeSubscriptionResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeSubscriptionResponse:
      type: object
      properties:
        currentSubscriptionPlan:
          $ref: '#/components/schemas/Subscription'
    Subscription:
      type: object
      additionalProperties: true
      properties:
        _id:
          type: string
        type:
          type: string
          example: subscription
        userID:
          type: string
        subscriptionPlanID:
          type: string
          example: free
        subscriptionPlanExpiration:
          type: string
          format: date-time
        maxTechnicalTicketsPerMonth:
          oneOf:
            - type: integer
            - type: string
          example: infinite
        subscriptionDurationType:
          type: string
          example: monthly
        technicalTicketsCount:
          type: integer
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.