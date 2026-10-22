> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a database

> create a database that user owns



## OpenAPI

````yaml /spec/dbaas.yaml post /v1/databases
openapi: 3.0.1
info:
  title: DBaaS
  description: |-
    Manage your databases using our API

    Parameters:
    - `teamID`: To access services in a team
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://api.liara.ir
security:
  - jwt: []
  - bearerAuth: []
tags:
  - name: Databases
    description: Everything about your Databases
  - name: Backups
    description: Backups endpoints
  - name: Reports
    description: Reports of your app
externalDocs:
  description: Find out more about DBaaS
  url: http://liara.ir
paths:
  /v1/databases:
    post:
      tags:
        - Databases
      summary: Create a database
      description: create a database that user owns
      operationId: createDatabase
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Create-databases'
        required: true
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                type: object
                properties:
                  databaseID:
                    type: string
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '409':
          description: Conflict
          content: {}
components:
  schemas:
    Create-databases:
      type: object
      properties:
        hostname:
          type: string
          description: The hostname of databases that you want to create
        options:
          type: object
          properties:
            standaloneReplicaSet:
              type: boolean
        publicNetwork:
          type: boolean
          description: The publicNetwork of databases that you want to create
        type:
          type: string
          description: The type of databases that you want to create
        planID:
          type: string
          description: The planID of databases that you want to create
        version:
          type: string
          description: The version of databases that you want to create
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.