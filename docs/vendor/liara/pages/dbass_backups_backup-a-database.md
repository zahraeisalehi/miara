> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Backup a database

> backup a database that user owns



## OpenAPI

````yaml /spec/dbaas.yaml post /v1/databases/{id}/backups
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
  /v1/databases/{id}/backups:
    post:
      tags:
        - Backups
      summary: Backup a database
      description: backup a database that user owns
      operationId: createBackup
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successful operation
          content: {}
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: Database not found
          content: {}
components:
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