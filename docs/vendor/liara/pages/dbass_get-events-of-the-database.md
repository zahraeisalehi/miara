> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get events of the database

> get events of the database owned by user



## OpenAPI

````yaml /spec/dbaas.yaml get /v1/databases/{name}/events
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
  /v1/databases/{name}/events:
    get:
      summary: Get events of the database
      description: get events of the database owned by user
      operationId: getDatabaseEvents
      parameters:
        - name: name
          in: path
          description: The name of database
          required: true
          schema:
            type: string
        - name: search
          in: query
          description: Show events based on search query
          required: false
          schema:
            type: string
        - name: start
          in: query
          description: start timestamp
          example: 1704028315
          required: false
          schema:
            type: number
        - name: end
          in: query
          description: end timestamp
          example: 1704028315
          required: false
          schema:
            type: number
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                required:
                  - data
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        metaData:
                          type: object
                        values:
                          type: array
                          items:
                            type: array
                            items:
                              type: string
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