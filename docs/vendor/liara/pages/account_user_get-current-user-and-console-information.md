> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get current user and console information

> Returns the authenticated user profile and console configuration. In team mode, the response also includes a `team` object.



## OpenAPI

````yaml /spec/me.yaml get /v1/me
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
  /v1/me:
    get:
      tags:
        - User
      summary: Get current user and console information
      description: >-
        Returns the authenticated user profile and console configuration. In
        team mode, the response also includes a `team` object.
      operationId: getMe
      responses:
        '200':
          description: Current user and console information
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MeResponse'
        '401':
          description: Unauthorized
      security:
        - bearerAuth: []
components:
  schemas:
    MeResponse:
      type: object
      properties:
        user:
          $ref: '#/components/schemas/User'
        team:
          $ref: '#/components/schemas/Team'
        databaseVersions:
          type: object
        defaultDatabaseVersions:
          type: object
        featureFlags:
          type: array
          items:
            $ref: '#/components/schemas/FeatureFlag'
        plans:
          $ref: '#/components/schemas/Plans'
    User:
      type: object
      properties:
        _id:
          type: string
        fullname:
          type: string
        email:
          type: string
        phone:
          type: string
        joined_at:
          type: string
          format: date-time
        hasPassword:
          type: boolean
        emailVerifiedAt:
          type: string
          nullable: true
        phoneVerifiedAt:
          type: string
          nullable: true
        isVerified:
          type: boolean
        isTeam:
          type: boolean
        isTeamCreator:
          type: boolean
          description: Present only in team mode.
        nationalCode:
          type: string
        invoiceIssuingEnabled:
          type: boolean
        storage:
          $ref: '#/components/schemas/Storage'
        accountType:
          type: string
        contactInfo:
          type: object
          additionalProperties: true
        contactInfoSavedAt:
          type: string
          format: date-time
          nullable: true
        minCreditAmount:
          type: number
        isManualMinCredit:
          type: boolean
        minCreditLastNotifiedAt:
          type: string
          format: date-time
          nullable: true
        hasSucceedPayment:
          type: boolean
        legacyNetworkFeature:
          type: boolean
        privateNetworkFeature:
          type: boolean
        legacyObjectStorageFeature:
          type: boolean
    Team:
      description: >-
        Present only in team mode. Contains the team profile, billing
        information and the member's role and permissions.
      allOf:
        - $ref: '#/components/schemas/User'
        - type: object
          properties:
            balance:
              type: number
            teamMemberRole:
              type: object
              properties:
                name:
                  type: string
                permissions:
                  type: array
                  items:
                    type: string
            teamMemberPermissions:
              type: array
              items:
                type: string
    FeatureFlag:
      type: object
      properties:
        key:
          type: string
        value:
          oneOf:
            - type: string
            - type: boolean
            - type: object
            - type: array
    Plans:
      type: object
      description: All available plans.
      properties:
        mail:
          type: object
          additionalProperties: true
        projects:
          type: object
          additionalProperties: true
        databases:
          type: object
          additionalProperties: true
        objectStorage:
          type: object
          additionalProperties: true
        legacyStorageService:
          type: object
          additionalProperties: true
        projectBundlePlans:
          type: object
          additionalProperties: true
        databaseBundlePlans:
          type: object
          additionalProperties: true
        subscription:
          type: object
          additionalProperties: true
    Storage:
      type: object
      properties:
        namespace:
          type: string
        status:
          type: string
        planID:
          type: string
        accessKey:
          type: string
        secretKey:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.