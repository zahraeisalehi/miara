> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get all databases

> get all databases that user owns



## OpenAPI

````yaml /spec/dbaas.yaml get /v1/databases
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
    get:
      tags:
        - Databases
      summary: Get all databases
      description: get all databases that user owns
      operationId: getListDatabases
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DBs-details'
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
components:
  schemas:
    DBs-details:
      type: object
      properties:
        databases:
          type: array
          items:
            type: object
            properties:
              DBId:
                type: string
                description: The ID of the database
              type:
                type: string
                description: The type of the database
              planID:
                type: string
                description: The plan ID
              status:
                type: string
                description: The status of the database
              scale:
                type: integer
                description: The scale of the database
              hostname:
                type: string
                description: The hostname of the database
              publicNetwork:
                type: boolean
                description: Indicates if the database is on a public network
              created_at:
                type: string
                description: The creation timestamp of the database
              internalPort:
                type: integer
                description: The internal port of the database
              id:
                type: string
                description: The unique ID of the database
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