> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get details of all projects

> get all details of all projects that user owns



## OpenAPI

````yaml /spec/paas.yaml get /v1/projects
openapi: 3.0.1
info:
  title: PaaS
  description: >-
    Manage your apps using our API


    [wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>](

    wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>)


    Parameters:

    - `token`: Your api token in liara

    - `cmd`: By default /bin/bash

    - `project_id`: The id of your project in liara

    - `teamID`: To access services in a team


    This `WebSocket` endpoint allows `real-time`

    communication with the projects service hosted

    at `Liara` You can use `WebSocket protocols`

    to send and receive data, enabling efficient and

    low-latency interactions with the projects
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
  - name: Apps
    description: Everything about your Apps
  - name: Deploy
    description: Deploy endpoints
  - name: Settings
    description: Settings of your app
  - name: Disks
    description: Disks of your app
  - name: Domains
    description: Domains of your app
  - name: Reports
    description: Reports of your app
externalDocs:
  description: Find out more about PaaS
  url: http://liara.ir
paths:
  /v1/projects:
    get:
      tags:
        - Apps
      summary: Get details of all projects
      description: get all details of all projects that user owns
      operationId: getApps
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Projects'
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: App does not exists.
          content: {}
components:
  schemas:
    Projects:
      type: object
      properties:
        projects:
          type: array
          items:
            type: object
            properties:
              _id:
                type: string
                description: The id of project
              project_id:
                type: string
                description: The name of project
              type:
                type: string
                description: The platform of project
              status:
                type: string
                description: The status of project
              scale:
                type: number
                description: The being on of project
              planID:
                type: string
                description: The plan of project
              created_at:
                type: string
                description: The time to create the project
              isDeployed:
                type: boolean
                description: The project deployment status
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