> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Create Zone

> creates a new zone on dns server



## OpenAPI

````yaml /spec/dns.yaml post /api/v1/zones
openapi: 3.0.1
info:
  title: DNS
  description: |-
    Manage dns zones and records

    Parameters:
    - `teamID`: To access services in a team
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://dns-service.liara.ir
security:
  - jwt: []
tags:
  - name: Zone
    description: Everything about your Zones
  - name: Check Name Servers
    description: Check Name Servers endpoints
  - name: Dns Record
    description: Dns Record of your zones
externalDocs:
  description: Find out more about DNS
  url: http://liara.ir
paths:
  /api/v1/zones:
    post:
      tags:
        - Zone
      summary: Create Zone
      description: creates a new zone on dns server
      operationId: createZone
      requestBody:
        description: The zone to create
        content:
          application/json:
            schema:
              required:
                - name
              type: object
              properties:
                name:
                  type: string
        required: true
      responses:
        '201':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Create-zone'
        '400':
          description: Bad Request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '409':
          description: Conflict
          content: {}
        '500':
          description: server does not response
          content: {}
components:
  schemas:
    Create-zone:
      type: object
      properties:
        status:
          type: string
        data:
          $ref: '#/components/schemas/Zone'
    Zone:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
          description: >-
            The name of the zone, “liara.ir”, max length: 253, pattern:
            ^([a-zA-Z0-9][\-a-zA-Z0-9]*\.)+[\-a-zA-Z0-9]{2,20}$
        status:
          type: string
          description: >-
            The status of the zone, valid values: [CREATING, PENDING, ACTIVE,
            DELETING]
        currentNameServers:
          type: array
          items:
            type: string
        nameServers:
          type: array
          items:
            type: string
        lastCheckAt:
          type: string
          description: Last time when zones nameservers was checked
        createdAt:
          type: string
          description: Time when zone was created
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.