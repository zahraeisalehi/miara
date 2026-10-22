> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get memory reports of database

> get memory reports of database that user owns



## OpenAPI

````yaml /spec/dbaas.yaml get /v1/databases/{id}/metrics/memory
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
  /v1/databases/{id}/metrics/memory:
    get:
      tags:
        - Reports
      summary: Get memory reports of database
      description: get memory reports of database that user owns
      operationId: getDatabaseMemoryReports
      parameters:
        - name: id
          in: path
          description: The name of your database
          required: true
          schema:
            type: string
        - name: since
          in: query
          description: The since of your memory reports
          required: true
          schema:
            type: number
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Reports'
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: Database does not exists.
          content: {}
components:
  schemas:
    Reports:
      type: object
      properties:
        end:
          type: number
        result:
          type: array
          items:
            type: object
            properties:
              values:
                type: array
                items:
                  type: array
                  items:
                    oneOf:
                      - type: number
                      - type: string
              applet:
                type: string
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