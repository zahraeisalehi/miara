> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Power on or power off a database

> power on or power off a database that user owns



## OpenAPI

````yaml /spec/dbaas.yaml post /v1/databases/{id}/actions/scale
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
  /v1/databases/{id}/actions/scale:
    post:
      tags:
        - Databases
      summary: Power on or power off a database
      description: power on or power off a database that user owns
      operationId: TurnDatabase
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        description: 1 for power on or 0 for power off
        content:
          application/json:
            schema:
              required:
                - scale
              type: object
              properties:
                scale:
                  type: number
        required: true
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