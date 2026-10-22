> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get summary reports of database

> get summary reports of database that user owns



## OpenAPI

````yaml /spec/dbaas.yaml get /v1/databases/{id}/metrics/summary
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
  /v1/databases/{id}/metrics/summary:
    get:
      tags:
        - Reports
      summary: Get summary reports of database
      description: get summary reports of database that user owns
      operationId: getDatabaseSummaryReports
      parameters:
        - name: id
          in: path
          description: The name of your database
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                type: object
                properties:
                  cpuUsage:
                    type: array
                    items:
                      type: object
                      properties:
                        value:
                          type: array
                          items:
                            oneOf:
                              - type: number
                              - type: string
                        applet:
                          type: string
                  memoryUsage:
                    type: array
                    items:
                      type: object
                      properties:
                        value:
                          type: array
                          items:
                            oneOf:
                              - type: number
                              - type: string
                        applet:
                          type: string
                  disksUsage:
                    type: array
                    items:
                      type: object
                      properties:
                        size:
                          type: string
                        usage:
                          type: string
                        reportedAt:
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