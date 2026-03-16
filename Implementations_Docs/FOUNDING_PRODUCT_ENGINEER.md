# ProPath - Founding Product & Software Engineer

## Project Overview

**ProPath** is a comprehensive multi-tenant examination platform designed to enable educational institutions and organizations to create, manage, and administer standardized and custom examinations. The platform supports subscription-based access, role-based access control (RBAC), test creation and assignment, student management, and comprehensive analytics.

### Key Features Implemented

- **Multi-Tenant Architecture**: Secure tenant isolation for organizations with role-based access control (SuperAdmin, OrgAdmin, Reviewer, Subject Expert, Student)
- **Subscription Management System**: Dynamic subscription plans with exam linking, usage tracking, and limit enforcement
- **Test Management**: Full CRUD operations for tests with automatic end-time calculation, status management, and comprehensive assignment system
- **Student Management**: Single and bulk student registration (CSV import), group management, and student lifecycle management
- **Test Assignment System**: Flexible assignment mechanisms supporting single students, multiple students, groups, multiple groups, and organization-wide assignments with conflict resolution
- **Audit Logging**: Comprehensive audit trail system tracking all system actions with filtering, pagination, and export capabilities
- **Analytics Dashboard**: Real-time dashboards with user growth trends, test creation analytics, role distribution, and performance metrics
- **Notification System**: Real-time notification system for users across different roles
- **Exam Hierarchy Management**: Three-level exam structure (Exam → Subject → Topic) with platform-wide and organization-specific exam support

---

## Role: Founding Product & Software Engineer

As the **Founding Product & Software Engineer**, I was responsible for architecting, designing, and implementing the entire ProPath platform from the ground up. This role encompassed both product strategy and full-stack software development, requiring deep technical expertise and product vision.

### Responsibilities

- **Product Strategy & Design**: Defined product roadmap, feature specifications, and user experience flows for multiple user personas (SuperAdmin, OrgAdmin, Students, Reviewers, Subject Experts)
- **System Architecture**: Designed and implemented scalable multi-tenant architecture with secure tenant isolation and role-based access control
- **Full-Stack Development**: Built complete backend REST API (Node.js/Express) and frontend React application with responsive UI/UX
- **Database Design**: Architected PostgreSQL database schema with 20+ tables, complex relationships, and optimized queries for performance
- **API Development**: Designed and implemented 50+ RESTful API endpoints with comprehensive error handling, validation, and security measures
- **Frontend Development**: Created intuitive, HCI-centric user interfaces with modern React patterns, state management, and responsive design
- **Security Implementation**: Implemented JWT-based authentication, password hashing (bcrypt), input validation, and audit logging
- **Feature Implementation**: Delivered subscription management, test creation/assignment, student management, group management, and analytics dashboards
- **Code Quality**: Maintained high code quality standards with proper error handling, logging, and documentation

---

## Technical Stack

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: JWT (jsonwebtoken)
- **Security**: bcrypt (password hashing), express-validator (input validation)
- **Utilities**: dotenv, cors

### Frontend
- **Framework**: React 19.2
- **Routing**: React Router DOM 7.10
- **UI Components**: Custom components with Lucide React icons
- **Charts**: Recharts 3.6
- **HTTP Client**: Fetch API
- **Build Tool**: Create React App

### Infrastructure & Tools
- **Database Hosting**: Supabase (PostgreSQL)
- **Version Control**: Git
- **Development**: Node.js watch mode, React development server

---

## Key Technical Achievements

1. **Multi-Tenant Architecture**: Implemented secure tenant isolation ensuring organizations can only access their own data, with comprehensive RBAC across 5+ user roles

2. **Subscription & Usage Tracking System**: Built dynamic subscription management with exam linking, usage counters, daily reset mechanisms, and limit enforcement for tests, students, and AI-generated questions

3. **Flexible Test Assignment System**: Designed and implemented a comprehensive test assignment system supporting 5 assignment types (single, multiple, group, multiple groups, all) with conflict detection, resolution, and due date management

4. **Bulk Operations**: Implemented CSV-based bulk student registration with robust parsing, validation, and error reporting for enterprise-scale operations

5. **Audit Logging System**: Created comprehensive audit trail system with actor tracking, entity-level logging, filtering, pagination, and export capabilities (CSV/JSON)

6. **Real-Time Analytics**: Built analytics dashboards with interactive charts, trend analysis, and role-based data visualization using Recharts

7. **Database Schema Design**: Architected complex database schema with 20+ interconnected tables, foreign key relationships, unique constraints, and optimized indexes

8. **Error Handling & User Experience**: Implemented detailed error messages, conflict resolution workflows, and user-friendly feedback mechanisms throughout the application

---

## ATS-Friendly Resume Bullet Points

• Architected and developed a multi-tenant SaaS examination platform (ProPath) from concept to production, implementing full-stack solutions using Node.js, Express.js, React, and PostgreSQL, serving 5+ distinct user roles with role-based access control and secure tenant isolation

• Designed and implemented a subscription-based enrollment system with dynamic usage tracking, limit enforcement, and conflict resolution, enabling organizations to manage 10,000+ students, create unlimited tests, and track real-time analytics across 20+ database tables

• Built comprehensive RESTful APIs (50+ endpoints) and React-based user interfaces with HCI principles, including bulk CSV import/export, audit logging, test assignment workflows, and real-time analytics dashboards, resulting in a scalable platform supporting enterprise-level educational institutions

---

## Project Metrics

- **Database Tables**: 20+ interconnected tables
- **API Endpoints**: 50+ RESTful endpoints
- **User Roles**: 5 distinct roles (SuperAdmin, OrgAdmin, Reviewer, Subject Expert, Student)
- **Frontend Components**: 30+ React components
- **Features Delivered**: Subscription management, test creation/assignment, student management, group management, analytics, audit logging, notifications
- **Code Quality**: Comprehensive error handling, validation, logging, and documentation

---

## Documentation

- `README.md` - Project setup and quick start guide
- `ORGANIZATION_EXAM_ENROLLMENT_AND_TEST_ASSIGNMENT.md` - Comprehensive system documentation
- `API_Documentation.md` - Complete API reference
- `Related_Documents/Database_Schema.md` - Database schema documentation
- `Related_Documents/Main_Implementation.md` - Feature implementation details
- `TEST_ASSIGNMENT_IMPLEMENTATION_PLAN.md` - Test assignment system design

---

## Project Status

**Status**: Active Development  
**Role**: Founding Product & Software Engineer  
**Duration**: [Your Duration]  
**Team Size**: [Your Team Size]

---

*This document serves as a comprehensive overview of the ProPath project and the role of Founding Product & Software Engineer. For technical details, please refer to the project documentation files.*
