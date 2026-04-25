Arquitectos del Futuro
Developer Implementation Guide
B2B SaaS Multi-Tenant College Counseling Platform
Version 1.0  February 2026
TIMS International & Nexa Development
Contents
1 Executive Summary 2
1.1 Platform Vision . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2
1.1.1 Key Value Propositions . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2
1.1.2 The Four Assessment Pillars . . . . . . . . . . . . . . . . . . . . . . . . . . 2
1.2 Pilot School: CDS . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2
1.3 Technology Stack . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2 User Perspectives & Platform Experience 4
2.1 Platform Philosophy . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
2.2 The Student Perspective . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
2.2.1 Why This Matters to Students . . . . . . . . . . . . . . . . . . . . . . . . 4
2.2.2 The Student Journey . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
2.2.3 What Students See . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
2.2.4 Key Student Features . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
2.3 The Parent Perspective . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
2.3.1 Why This Matters to Parents . . . . . . . . . . . . . . . . . . . . . . . . . 6
2.3.2 What Parents See . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
2.3.3 360-Degree Evaluation (Parent Version) . . . . . . . . . . . . . . . . . . . 7
2.3.4 Why Parent Input Matters . . . . . . . . . . . . . . . . . . . . . . . . . . 7
2.4 The College Counselor Perspective . . . . . . . . . . . . . . . . . . . . . . . . . . 7
2.4.1 Why This Matters to Counselors . . . . . . . . . . . . . . . . . . . . . . . 7
2.4.2 The Counselor Dashboard . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
2.4.3 Student Detail View (Counselor) . . . . . . . . . . . . . . . . . . . . . . . 8
2.4.4 Key Counselor Features . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9
2.5 The School Administrator Perspective . . . . . . . . . . . . . . . . . . . . . . . . 9
2.5.1 Why This Matters to Administrators . . . . . . . . . . . . . . . . . . . . . 9
2.5.2 The Admin Dashboard . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9
2.5.3 Key Admin Features . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 10
2.6 The Platform Administrator (Super Admin) Perspective . . . . . . . . . . . . . . 10
2.6.1 Why This Matters . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 10
2.6.2 The Super Admin Dashboard . . . . . . . . . . . . . . . . . . . . . . . . . 11
2.6.3 Key Super Admin Features . . . . . . . . . . . . . . . . . . . . . . . . . . 11
2.7 How Roles Interact . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 11
2.8 Design Principles Behind Each Role . . . . . . . . . . . . . . . . . . . . . . . . . 12
3 Architecture Overview 13
3.1 Multi-Tenant Architecture . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13
3.2 User Roles and Permissions . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13
1
CONTENTS Arquitectos del Futuro
4 EPIC 1: School Administration Portal 14
4.1 TASK 1.1: School Prole Setup . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14
4.1.1 Description . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14
4.1.2 Acceptance Criteria . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14
4.1.3 Data Model . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14
4.1.4 API Endpoints . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15
4.1.5 UI Wireframe . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15
4.2 TASK 1.2: Curriculum Framework Conguration . . . . . . . . . . . . . . . . . . 15
4.2.1 Curriculum Types . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15
4.2.2 Data Model . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15
4.3 TASK 1.3: Course/Subject Management . . . . . . . . . . . . . . . . . . . . . . . 16
4.3.1 Data Model . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 16
4.3.2 CSV Import Format . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 16
4.3.3 UI Wireframe - Course List . . . . . . . . . . . . . . . . . . . . . . . . . . 17
4.4 TASK 1.4: Graduation Rules Engine . . . . . . . . . . . . . . . . . . . . . . . . . 17
4.4.1 Example Requirements (CDS) . . . . . . . . . . . . . . . . . . . . . . . . . 17
4.4.2 Data Model . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 17
4.5 TASK 1.5: Academic Calendar Setup . . . . . . . . . . . . . . . . . . . . . . . . . 18
4.6 TASK 1.6: User Role Management . . . . . . . . . . . . . . . . . . . . . . . . . . 18
5 EPIC 2: Curriculum & Course Trajectory 19
5.1 TASK 2.1: Course Catalog Import . . . . . . . . . . . . . . . . . . . . . . . . . . 19
5.1.1 Import Process . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19
5.1.2 Validation Rules . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19
5.2 TASK 2.2: AP/IB Course Recognition (AI) . . . . . . . . . . . . . . . . . . . . . 19
5.2.1 AI Prompt Example . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19
5.3 TASK 2.3: Prerequisites Engine . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20
5.4 TASK 2.4: Course Sequence Builder . . . . . . . . . . . . . . . . . . . . . . . . . 20
5.4.1 UI Wireframe . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20
5.4.2 Data Structure . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 21
5.5 TASK 2.5: Gap Analysis Algorithm . . . . . . . . . . . . . . . . . . . . . . . . . . 21
5.5.1 Gap Types . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 21
5.6 TASK 2.6: AI Course Recommendations . . . . . . . . . . . . . . . . . . . . . . . 22
5.6.1 AI Input . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 22
5.6.2 AI Output . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 22
6 EPIC 3: Integration Layer 23
6.1 TASK 3.1: CSV Grade Import . . . . . . . . . . . . . . . . . . . . . . . . . . . . 23
6.1.1 CSV Format . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 23
6.1.2 Validation . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 23
6.2 TASK 3.2: Data Mapping Engine . . . . . . . . . . . . . . . . . . . . . . . . . . . 23
7 EPIC 4: Assessment System 25
7.1 TASK 4.1: Assessment Conguration . . . . . . . . . . . . . . . . . . . . . . . . . 25
7.2 TASK 4.2: 360-Degree Evaluation Invites . . . . . . . . . . . . . . . . . . . . . . 25
7.2.1 Flow . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 25
8 EPIC 5: Counselor Dashboard 27
8.1 TASK 5.1: Student List View . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27
8.2 TASK 5.2: Alert System . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27
8.2.1 Alert Types . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27
2
CONTENTS Arquitectos del Futuro
9 EPIC 6: Student Portal 28
9.1 TASK 6.1: CV/Resume Generator . . . . . . . . . . . . . . . . . . . . . . . . . . 28
9.1.1 Data Sources for CV . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28
9.1.2 Implementation . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28
9.2 TASK 6.2: University Suggestions (AI) . . . . . . . . . . . . . . . . . . . . . . . . 28
9.2.1 Matching Criteria . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28
10 JIRA Task Reference 29
11 Testing Strategy 30
11.1 Test Coverage Requirements . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 30
11.2 Critical Test Scenarios . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 30
12 Open Questions for TIMS Team 31
13 CDS Meeting Summary 32
14 Glossary 33
3
Chapter 1
Executive Summary
1.1 Platform Vision
Arquitectos del Futuro is a comprehensive B2B SaaS platform designed to transform how
schools approach college counseling and career readiness.
1.1.1 Key Value Propositions
 95% Scientic Reliability  Assessments validated through rigorous research
 Longitudinal Tracking  Follow student development from 9th to 12th grade
 AI-Powered Recommendations  Personalized course and career suggestions
 Multi-Tenant Architecture  Complete data isolation between schools
 Bilingual Support  Full Spanish and English localization
1.1.2 The Four Assessment Pillars

1. PCA (Professional Competencies Assessment)  Measures 12 core competencies
2. Fluid Intelligence Test  Assesses abstract reasoning capabilities
3. 360-Degree Evaluation  Gathers perspectives from parents, teachers, peers
4. Personality & Interests Inventory  Identies career-aligned traits
   1.2 Pilot School: CDS
   Requirements from February 6, 2026 meeting:
    Integration with existing iSAMS student information system
    Support for multiple curriculum frameworks (AP, IB, National Costa Rica)
    Automatic graduation progress tracking
    AI-generated CV/resume for university applications
    Parent portal access for 360-degree evaluations
   4
   CHAPTER 1. EXECUTIVE SUMMARY Arquitectos del Futuro
   1.3 Technology Stack
   Component Technology
   Backend C# .NET 8.0
   Database SQL Server / PostgreSQL
   Frontend To be conrmed (React/Blazor)
   Authentication JWT with role-based access
   AI/ML Azure OpenAI / Custom Models
   Hosting Azure Cloud Services
   5
   Chapter 2
   User Perspectives & Platform
   Experience
   This chapter explains how each user role experiences the platform, the logic behind their work-
   ows, and why the system is designed to serve their specic needs.
   2.1 Platform Philosophy
   The platform is built around a simple principle: every stakeholder in a student's educational journey should have the right information at the right time to make better
   decisions.
    Students need clarity about their path forward and condence that their choices align
   with their goals
    Parents need visibility into their child's progress and opportunities to contribute meaningful insights
    Counselors need data-driven tools to eciently guide dozens of students with personalized
   attention
    School Administrators need oversight, conguration control, and institutional reporting
    Platform Administrators need multi-tenant management and system-wide monitoring
   2.2 The Student Perspective
   2.2.1 Why This Matters to Students
   Students face overwhelming decisions: Which courses should I take? What career ts me? Which
   universities should I apply to? Traditional counseling often provides generic advice because
   counselors lack the time and data to personalize guidance for each student.
   Arquitectos del Futuro gives students a personalized roadmap based on scientic assessments, not guesswork.
   2.2.2 The Student Journey
   GRADE 9 (Entry Point)
   |
   v
   +-------------------+ +----------------------+
   6
   CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
   | Complete Profile | --> | Take Initial |
   | - Basic info | | Assessments |
   | - Interests | | - PCA |
   | - Goals | | - Fluid Intelligence |
   +-------------------+ | - Personality Test |
   +----------------------+
   |
   v
   +-----------------------------+
   | View My Dashboard |
   | - Career matches |
   | - Recommended courses |
   | - Progress toward graduation|
   +-----------------------------+
   |
   +------------------------------+------------------------------+
   | | |
   v v v
   +----------------+ +-------------------+ +------------------+
   | Course Planner | | Portfolio Builder | | University |
   | - See trajectory| | - Add activities | | Explorer |
   | - Track progress| | - Upload awards | | - AI suggestions |
   | - View prereqs | | - Build CV | | - Compare schools|
   +----------------+ +-------------------+ +------------------+
   |
   v
   GRADE 12 (Exit Point)
   +-----------------------------+
   | Graduate with: |
   | - Complete transcript |
   | - Professional CV |
   | - University applications |
   | - Career clarity |
   +-----------------------------+
   2.2.3 What Students See
   Dashboard (Home Screen):
   +------------------------------------------------------------------+
   | Welcome back, Maria! Grade 11 | CDS |
   +------------------------------------------------------------------+
   | |
   | YOUR PROGRESS YOUR TOP CAREER MATCHES |
   | +------------------------+ +---------------------------+ |
   | | Graduation: 72% | | 1. Software Engineering | |
   | | [=============> ] | | 2. Data Science | |
   | | | | 3. Business Analytics | |
   | | Assessments: 3/4 Done | +---------------------------+ |
   | | [===========> ] | |
   | +------------------------+ NEXT STEPS |
   | [ ] Complete Personality Test |
   7
   CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
   | UPCOMING [ ] Review course plan for G12 |
   | - AP Calculus midterm (Oct 15) [ ] Add summer internship |
   | - 360 Evaluation due (Oct 20) |
   +------------------------------------------------------------------+
   | RECOMMENDED COURSES FOR NEXT SEMESTER |
   | +----------------+ +----------------+ +----------------+ |
   | | AP Comp Sci A | | Statistics | | Physics | |
   | | Why: Career | | Why: College | | Why: Grad req | |
   | | alignment | | prep | | | |
   | +----------------+ +----------------+ +----------------+ |
   +------------------------------------------------------------------+
   2.2.4 Key Student Features
5. My Assessments  Take and review all four pillar assessments
6. Course Trajectory  Visual owchart of courses from 9th-12th grade
7. Career Explorer  See how assessments map to career paths
8. Portfolio  Document extracurriculars, awards, projects
9. CV Generator  Auto-generate professional resume
10. University Matches  AI-recommended schools based on prole
    2.3 The Parent Perspective
    2.3.1 Why This Matters to Parents
    Parents want to support their child's education but often feel disconnected from the school's
    planning process. They have valuable insights about their child's character and behavior at
    home that schools never see.
    Arquitectos del Futuro gives parents visibility and voicethey can see their child's progress
    and contribute to the 360-degree evaluation.
    2.3.2 What Parents See
    Parents have a limited but meaningful portal:
    +------------------------------------------------------------------+
    | Parent Portal Viewing: Maria Lopez |
    +------------------------------------------------------------------+
    | |
    | CHILD'S PROGRESS SUMMARY |
    | +--------------------------------------------------------------+ |
    | | Grade: 11 GPA: 3.7 On Track: YES | |
    | | Credits: 18/24 Assessments: 3/4 Career Path: Technology | |
    | +--------------------------------------------------------------+ |
    | |
    | PENDING ACTIONS |
    | +--------------------------------------------------------------+ |
    | | [!] Complete 360-Degree Evaluation | |
    | | Your perspective on Maria's competencies helps her | |
    8
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
    | | counselor provide better guidance. | |
    | | [Start Evaluation] | |
    | +--------------------------------------------------------------+ |
    | |
    | RECENT UPDATES |
    | - Oct 10: Completed AP History with grade A- |
    | - Oct 5: Added "Debate Club President" to portfolio |
    | - Sep 28: Career match updated: Software Engineering (92%) |
    +------------------------------------------------------------------+
    2.3.3 360-Degree Evaluation (Parent Version)
    The parent evaluation asks about competencies observed at home:
    +------------------------------------------------------------------+
    | 360-Degree Evaluation for Maria Lopez |
    +------------------------------------------------------------------+
    | Rate your child on each competency (1-5 scale): |
    | |
    | INITIATIVE |
    | "Does your child start projects or activities without being asked?"|
    | ( ) 1-Rarely ( ) 2 (X) 3-Sometimes ( ) 4 ( ) 5-Always |
    | |
    | RESPONSIBILITY |
    | "Does your child follow through on commitments?" |
    | ( ) 1-Rarely ( ) 2 ( ) 3 (X) 4 ( ) 5-Always |
    | |
    | TEAMWORK |
    | "How well does your child collaborate with siblings or peers?" |
    | ( ) 1-Poorly ( ) 2 ( ) 3 ( ) 4 (X) 5-Excellently |
    | |
    | [Additional questions...] |
    | |
    | [Save Progress] [Submit]|
    +------------------------------------------------------------------+
    2.3.4 Why Parent Input Matters
     Teachers see academic behavior; parents see personal character
     Combined perspectives create a complete picture
     Helps identify strengths that don't show in grades
     Reveals growth areas for counselor conversations
    2.4 The College Counselor Perspective
    2.4.1 Why This Matters to Counselors
    Counselors are the heart of the platform. They typically manage 50-150+ students and need
    tools that help them:
     Identify which students need immediate attention
    9
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
     Provide personalized guidance without starting from scratch each meeting
     Track progress across their entire caseload
     Generate reports for students, parents, and administration
    Arquitectos del Futuro transforms counselors from data gatherers into strategic advisors
    by automating the data collection and surfacing insights.
    2.4.2 The Counselor Dashboard
    +------------------------------------------------------------------+
    | Counselor Dashboard Ms. Rodriguez | 156 Students|
    +------------------------------------------------------------------+
    | ALERTS (7) [View All] |
    | +--------------------------------------------------------------+ |
    | | [!] HIGH: Carlos Perez - GPA dropped 0.6 this semester | |
    | | [!] HIGH: Ana Ruiz - Missing 2 assessments (deadline passed) | |
    | | [!] MED: Juan Torres - No career path assigned (Grade 12) | |
    | | [!] MED: Sofia Chen - Behind on Science credits | |
    | +--------------------------------------------------------------+ |
    | |
    | MY STUDENTS [Search] [Filter: All v] |
    | +--------------------------------------------------------------+ |
    | | Name | Grade | Status | Progress | Assess | Next | |
    | +--------------------------------------------------------------+ |
    | | Maria Lopez | 11 | On Track | 72% | 3/4 | Oct 20| |
    | | Carlos Perez | 10 | AT RISK | 45% | 2/4 | ASAP | |
    | | Ana Martinez | 12 | On Track | 95% | 4/4 | Nov 1 | |
    | | Juan Torres | 12 | WARNING | 88% | 4/4 | ASAP | |
    | +--------------------------------------------------------------+ |
    | |
    | QUICK ACTIONS |
    | [+ Add Student] [Send Assessment] [Generate Report] [Schedule] |
    +------------------------------------------------------------------+
    2.4.3 Student Detail View (Counselor)
    When a counselor clicks on a student, they see everything:
    +------------------------------------------------------------------+
    | Student Profile: Maria Lopez [Edit] [Report] |
    +------------------------------------------------------------------+
    | BASIC INFO | ASSESSMENT SUMMARY |
    | Grade: 11 | PCA Score: 85/100 |
    | GPA: 3.7 | - Leadership: 92 |
    | Target Career: Software Eng. | - Initiative: 88 |
    | Target Universities: | - Teamwork: 78 |
    | - Stanford, MIT, Georgia Tech | Fluid Intelligence: 82 |
    +-----------------------------------| Personality: INTJ |
    | GRADUATION PROGRESS | 360 Status: Pending (1/3) |
    | [=================> ] 72% +-------------------------------+
    | |
    | COURSE TRAJECTORY |
    10
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
    | +----------+----------+----------+----------+ |
    | | Grade 9 | Grade 10 | Grade 11 | Grade 12 | |
    | | Alg I [x]| Alg II[x]| PreCalc[]| AP Calc[]| |
    | | Bio [x] | Chem [x] | Physics[]| AP CSA[] | |
    | | Eng 9[x] | Eng10 [x]| AP Eng[] | AP Eng[] | |
    | +----------+----------+----------+----------+ |
    | |
    | GAP ANALYSIS |
    | [!] Needs 1 more Science credit - Recommend: AP Physics |
    | [i] On track for all other categories |
    | |
    | COUNSELOR NOTES |
    | Oct 5: Discussed summer internship opportunities. Maria |
    | interested in Google CSSI program. Follow up in Nov. |
    | Sep 15: Reviewed course plan for Grade 12. Added AP CS. |
    +------------------------------------------------------------------+
    2.4.4 Key Counselor Features
11. Alert Dashboard  Automatic ags for students needing attention
12. Caseload Management  Filter, sort, and search all students
13. Student 360 View  Complete prole with assessments, courses, progress
14. Course Recommendations  AI suggests courses; counselor approves
15. 360 Evaluation Management  Send invites to parents/teachers, track completion
16. Report Generation  Export student reports for meetings
17. Bulk Actions  Send assessments or notications to multiple students
    2.5 The School Administrator Perspective
    2.5.1 Why This Matters to Administrators
    School administrators (principals, academic directors) need to:
     Congure the platform for their school's specic curriculum
     Manage users (counselors, students, parents)
     Monitor overall school performance
     Ensure data compliance and security
    Arquitectos del Futuro gives administrators a control center for platform conguration
    and institutional oversight.
    2.5.2 The Admin Dashboard
    +------------------------------------------------------------------+
    | School Admin Dashboard CDS | San Jose, CR |
    +------------------------------------------------------------------+
    | SCHOOL OVERVIEW |
    11
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
    | +--------------------------------------------------------------+ |
    | | Total Students: 450 | Counselors: 4 | Active: 98% | |
    | | Avg Progress: 71% | Assessments: 67% | At Risk: 12% | |
    | +--------------------------------------------------------------+ |
    | |
    | QUICK LINKS |
    | +----------------+ +----------------+ +----------------+ |
    | | School Setup | | User Mgmt | | Curriculum | |
    | | - Profile | | - Counselors | | - Courses | |
    | | - Settings | | - Students | | - Frameworks | |
    | | - Calendar | | - Parents | | - Grad Rules | |
    | +----------------+ +----------------+ +----------------+ |
    | |
    | +----------------+ +----------------+ +----------------+ |
    | | Integrations | | Reports | | Assessments | |
    | | - iSAMS Sync | | - Progress | | - Configure | |
    | | - Grade Import| | - Graduation | | - Schedule | |
    | | - Data Map | | - Counselor | | - Results | |
    | +----------------+ +----------------+ +----------------+ |
    | |
    | RECENT ACTIVITY |
    | - Oct 12: Grade import completed (450 records) |
    | - Oct 10: New counselor added: Mr. Jimenez |
    | - Oct 8: Graduation requirements updated for Class of 2027 |
    +------------------------------------------------------------------+
    2.5.3 Key Admin Features
18. School Prole  Congure name, logo, timezone, language
19. Curriculum Setup  Enable AP/IB/National frameworks, manage courses
20. Graduation Requirements  Dene credit and course requirements
21. User Management  Add/remove counselors, bulk import students
22. Academic Calendar  Set terms, assessment periods, deadlines
23. Data Integration  Import grades from iSAMS, map course codes
24. Institutional Reports  School-wide progress, counselor caseloads
    2.6 The Platform Administrator (Super Admin) Perspective
    2.6.1 Why This Matters
    Platform administrators (the Arquitectos del Futuro team) need to:
     Manage multiple school tenants
     Monitor system health and performance
     Onboard new schools
     Handle support escalations
    This role is for internal platform management, not school sta.
    12
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
    2.6.2 The Super Admin Dashboard
    +------------------------------------------------------------------+
    | Platform Admin Dashboard Arquitectos del Futuro |
    +------------------------------------------------------------------+
    | TENANT OVERVIEW |
    | +--------------------------------------------------------------+ |
    | | Active Schools: 12 | Total Students: 5,400 | Healthy: 11| |
    | | Trial Schools: 3 | Total Counselors: 48 | Issues: 1 | |
    | +--------------------------------------------------------------+ |
    | |
    | SCHOOLS [+ Add New] |
    | +--------------------------------------------------------------+ |
    | | School | Country | Students | Status | Health | |
    | +--------------------------------------------------------------+ |
    | | CDS | Costa Rica | 450 | Active | Healthy | |
    | | Lincoln School| Costa Rica | 620 | Active | Healthy | |
    | | American Sch. | Guatemala | 380 | Active | Warning | |
    | | British School| Panama | 290 | Trial | Healthy | |
    | +--------------------------------------------------------------+ |
    | |
    | SYSTEM HEALTH |
    | API Response Time: 145ms (avg) | Uptime: 99.97% |
    | Database Load: 23% | AI Calls Today: 1,247 |
    | |
    | RECENT SUPPORT TICKETS |
    | - #1247: CDS - Grade import failing (Resolved) |
    | - #1245: Lincoln - Assessment timeout issue (In Progress) |
    +------------------------------------------------------------------+
    2.6.3 Key Super Admin Features
25. Tenant Management  Create, congure, suspend school tenants
26. System Monitoring  API health, database performance, error rates
27. Usage Analytics  Logins, assessments taken, feature adoption
28. Support Tools  View school data for troubleshooting (with audit)
29. Billing Management  Subscription status, usage limits
30. Feature Flags  Enable/disable features per tenant
    2.7 How Roles Interact
    The platform creates a collaborative ecosystem:
    +-------------------+
    | PLATFORM ADMIN |
    | (Super Admin) |
    | - Manages tenants |
    | - System health |
    +--------+----------+
    13
    CHAPTER 2. USER PERSPECTIVES & PLATFORM EXPERIENCEArquitectos del Futuro
    |
    | Creates/Manages
    v
    +-------------------+
    | SCHOOL ADMIN |
    | - Configures |
    | - Manages users |
    | - Sets curriculum |
    +--------+----------+
    |
    +--------------+--------------+
    | |
    v v
    +-------------------+ +-------------------+
    | COUNSELOR | | COUNSELOR |
    | - Guides students | | - Guides students |
    | - Reviews data | | - Reviews data |
    +--------+----------+ +--------+----------+
    | |
    +--------+--------+ +--------+--------+
    | | | | | |
    v v v v v v
    +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
    |Student| |Student| |Student| |Student| |Student| |Student|
    +---+---+ +---+---+ +---+---+ +---+---+ +---+---+ +---+---+
    | | | | | |
    v v v v v v
    +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
    |Parent | |Parent | |Parent | |Parent | |Parent | |Parent |
    +-------+ +-------+ +-------+ +-------+ +-------+ +-------+
    Data Flow:

- Students take assessments, update portfolios
- Parents complete 360-degree evaluations
- Counselors review combined data, provide guidance
- School Admin monitors institutional progress
- Platform Admin ensures system health
  2.8 Design Principles Behind Each Role
  Role Primary Need Design Principle
  Student Clarity & Direction Simple, visual, action-oriented
  interface
  Parent Visibility & Voice Limited scope but meaningful
  contribution
  Counselor Eciency & Insight Data-rich dashboards, alerts,
  bulk tools
  School Admin Control & Oversight Conguration power, institutional reports
  Platform Admin Reliability & Scale Multi-tenant management, monitoring
  14
  Chapter 3
  Architecture Overview
  3.1 Multi-Tenant Architecture
  The platform uses a tenant-per-school architecture where each school operates as an independent tenant with complete data isolation.
  +------------------+ +------------------+ +------------------+
  | School A | | School B | | School C |
  | (Tenant) | | (Tenant) | | (Tenant) |
  +--------+---------+ +--------+---------+ +--------+---------+
  | | |
  v v v
  +------------------------------------------------------------------+
  | Shared Application Layer |
  | (API, Business Logic, AI Services) |
  +------------------------------------------------------------------+
  | | |
  v v v
  +------------------+ +------------------+ +------------------+
  | Database A | | Database B | | Database C |
  +------------------+ +------------------+ +------------------+
  3.2 User Roles and Permissions
  Role Permissions
  School Admin Full access: settings, curriculum, users, all students
  College Counselor View/edit assigned students, view curriculum, create reports
  Student View own prole, take assessments, update portfolio
  Parent View child's prole (if enabled), complete 360-degree evaluation
  15
  Chapter 4
  EPIC 1: School Administration Portal
  4.1 TASK 1.1: School Prole Setup
  JIRA Reference: SCRUM-130 Priority: HIGH Estimate: 4 hours
  4.1.1 Description
  Create the foundational school entity that serves as the tenant root for all school-related data.
  4.1.2 Acceptance Criteria
   School admin can create/edit school prole
   School prole includes all required elds
   Logo upload with image validation (max 2MB, PNG/JPG)
   Data is tenant-isolated
  4.1.3 Data Model
  1 public class School
  2 {
  3 public Guid Id { get ; set ; }
  4 public string Name { get ; set ; } // " Colegio CDS "
  5 public string Country { get ; set ; } // " Costa Rica "
  6 public string City { get ; set ; } // " San Jose "
  7 public string Address { get ; set ; }
  8 public string Phone { get ; set ; }
  9 public string Email { get ; set ; }
  10 public string Website { get ; set ; }
  11 public string LogoUrl { get ; set ; }
  12 public string Timezone { get ; set ; } // " America / Costa_Rica "
  13 public bool IsActive { get ; set ; }
  14 public DateTime CreatedAt { get ; set ; }
  15 public SchoolSettings Settings { get ; set ; }
  16 }
  17
  18 public class SchoolSettings
  19 {
  20 public bool AllowParentAccess { get ; set ; }
  21 public bool RequireProctoring { get ; set ; }
  22 public string DefaultLanguage { get ; set ; } // " es " or " en "
  23 public List < string > EnabledCurriculumTypes { get ; set ; }
  16
  CHAPTER 4. EPIC 1: SCHOOL ADMINISTRATION PORTAL Arquitectos del Futuro
  24 }
  4.1.4 API Endpoints
  1 POST / api / schools
  2 GET / api / schools /{ schoolId }
  3 PUT / api / schools /{ schoolId }
  4 POST / api / schools /{ schoolId }/ logo
  4.1.5 UI Wireframe
  +------------------------------------------------------------------+
  | SCHOOL PROFILE SETUP |
  +------------------------------------------------------------------+
  | [Logo Upload] School Name: [___________________] |
  | Country: [Costa Rica v] |
  | City: [___________________] |
  | Address: [___________________] |
  | Phone: [___________________] |
  | Email: [___________________] |
  | Website: [___________________] |
  | Timezone: [America/Costa_Rica v] |
  | |
  | --- Settings --- |
  | [x] Allow parent access |
  | [x] Require proctoring for assessments |
  | Default Language: ( ) Spanish (x) English |
  | |
  | Enabled Curricula: |
  | [x] AP [x] IB [x] National [x] Custom |
  | |
  | [Cancel] [Save Changes] |
  +------------------------------------------------------------------+
  4.2 TASK 1.2: Curriculum Framework Conguration
  JIRA Reference: SCRUM-131 Priority: HIGH Estimate: 8 hours
  4.2.1 Curriculum Types
  Type Description Example
  AP Advanced Placement (US College Board)
  AP Calculus, AP Biology
  IB International Baccalaureate IB Mathematics HL
  National Costa Rica MEP curriculum Matematicas 10
  Custom School-dened courses Leadership Seminar
  4.2.2 Data Model
  17
  CHAPTER 4. EPIC 1: SCHOOL ADMINISTRATION PORTAL Arquitectos del Futuro
  1 public class CurriculumFramework
  2 {
  3 public Guid Id { get ; set ; }
  4 public Guid SchoolId { get ; set ; }
  5 public string Type { get ; set ; } // " AP " , " IB " , " National "
  6 public string Name { get ; set ; }
  7 public bool IsEnabled { get ; set ; }
  8 public List < CurriculumRequirement > Requirements { get ; set ; }
  9 }
  10
  11 public class CurriculumRequirement
  12 {
  13 public Guid Id { get ; set ; }
  14 public string Category { get ; set ; } // " Math " , " Science "
  15 public int MinCredits { get ; set ; }
  16 public int MinCourses { get ; set ; }
  17 public List < Guid > EligibleCourseIds { get ; set ; }
  18 }
  4.3 TASK 1.3: Course/Subject Management
  JIRA Reference: SCRUM-132 Priority: HIGH Estimate: 8 hours
  4.3.1 Data Model
  1 public class Course
  2 {
  3 public Guid Id { get ; set ; }
  4 public Guid SchoolId { get ; set ; }
  5 public string Code { get ; set ; } // " MATH -301"
  6 public string Name { get ; set ; } // " Algebra II "
  7 public string Description { get ; set ; }
  8 public string Category { get ; set ; } // " Mathematics "
  9 public decimal Credits { get ; set ; } // 1.0
  10 public List < int > GradeLevels { get ; set ; } // [10 , 11]
  11 public List < Guid > PrerequisiteIds { get ; set ; }
  12 public List < Guid > CorequisiteIds { get ; set ; }
  13 public List < string > CurriculumFrameworks { get ; set ; }
  14 public string APEquivalent { get ; set ; }
  15 public string IBEquivalent { get ; set ; }
  16 public bool IsRequired { get ; set ; }
  17 public bool IsActive { get ; set ; }
  18 }
  4.3.2 CSV Import Format
  1 code , name , category , credits , grade_levels , prerequisites , is_required
  2 MATH -101 , Pre - Algebra , Mathematics ,1.0 ,"9" , ," true "
  3 MATH -201 , Algebra I , Mathematics ,1.0 ,"9 ,10" , MATH -101 ," true "
  4 MATH -301 , Algebra II , Mathematics ,1.0 ,"10 ,11" , MATH -201 ," true "
  18
  CHAPTER 4. EPIC 1: SCHOOL ADMINISTRATION PORTAL Arquitectos del Futuro
  4.3.3 UI Wireframe - Course List
  +------------------------------------------------------------------+
  | COURSE CATALOG [+ Add Course] [Import CSV] |
  +------------------------------------------------------------------+
  | Search: [________________] Category: [All v] Grade: [All] |
  +------------------------------------------------------------------+
  | CODE | NAME | CATEGORY | GRADE | CREDITS | |
  +------------------------------------------------------------------+
  | MATH-101 | Pre-Algebra | Mathematics | 9 | 1.0 | ... |
  | MATH-201 | Algebra I | Mathematics | 9,10 | 1.0 | ... |
  | MATH-301 | Algebra II | Mathematics | 10,11 | 1.0 | ... |
  | AP-CALC | AP Calculus AB | Mathematics | 11,12 | 1.0 | ... |
  +------------------------------------------------------------------+
  4.4 TASK 1.4: Graduation Rules Engine
  JIRA Reference: SCRUM-133 Priority: HIGH Estimate: 12 hours
  4.4.1 Example Requirements (CDS)
  Total Credits Required: 24
  Category Requirements:
- Mathematics: 4 credits (must include Algebra I, Geometry, Algebra II)
- Science: 3 credits (must include Biology, Chemistry or Physics)
- English: 4 credits
- Social Studies: 3 credits
- Foreign Language: 2 credits
- Electives: 8 credits
  Special Requirements:
- 40 hours community service
- Senior project completion
- Must pass all 4 assessment pillars
  4.4.2 Data Model
  1 public class GraduationRequirements
  2 {
  3 public Guid Id { get ; set ; }
  4 public Guid SchoolId { get ; set ; }
  5 public string Name { get ; set ; }
  6 public int ApplicableFromYear { get ; set ; }
  7 public decimal TotalCreditsRequired { get ; set ; }
  8 public List < CategoryRequirement > CategoryRequirements { get ; set ; }
  9 public List < Guid > MandatoryCourseIds { get ; set ; }
  10 public List < SpecialRequirement > SpecialRequirements { get ; set ; }
  11 }
  12
  13 public class StudentGraduationProgress
  14 {
  15 public Guid StudentId { get ; set ; }
  16 public decimal TotalCreditsEarned { get ; set ; }
  19
  CHAPTER 4. EPIC 1: SCHOOL ADMINISTRATION PORTAL Arquitectos del Futuro
  17 public decimal TotalCreditsRequired { get ; set ; }
  18 public decimal OverallPercentage { get ; set ; }
  19 public List < CategoryProgress > CategoryProgress { get ; set ; }
  20 public bool IsOnTrack { get ; set ; }
  21 public List < string > Alerts { get ; set ; }
  22 }
  4.5 TASK 1.5: Academic Calendar Setup
  JIRA Reference: SCRUM-134 Priority: MEDIUM Estimate: 6 hours
  1 public class AcademicYear
  2 {
  3 public Guid Id { get ; set ; }
  4 public Guid SchoolId { get ; set ; }
  5 public string Name { get ; set ; } // "2025 -2026"
  6 public DateTime StartDate { get ; set ; }
  7 public DateTime EndDate { get ; set ; }
  8 public bool IsCurrent { get ; set ; }
  9 public List < AcademicTerm > Terms { get ; set ; }
  10 }
  11
  12 public class AcademicTerm
  13 {
  14 public Guid Id { get ; set ; }
  15 public string Name { get ; set ; } // " Fall Semester "
  16 public DateTime StartDate { get ; set ; }
  17 public DateTime EndDate { get ; set ; }
  18 public DateTime GradeDeadline { get ; set ; }
  19 }
  4.6 TASK 1.6: User Role Management
  JIRA Reference: SCRUM-135 Priority: HIGH Estimate: 8 hours
  1 public class SchoolUser
  2 {
  3 public Guid Id { get ; set ; }
  4 public Guid SchoolId { get ; set ; }
  5 public string Email { get ; set ; }
  6 public string FirstName { get ; set ; }
  7 public string LastName { get ; set ; }
  8 public string Role { get ; set ; } // " admin " , " counselor " , " student
  " , " parent "
  9 public bool IsActive { get ; set ; }
  10 public DateTime ? LastLoginAt { get ; set ; }
  11 public List < Guid > AssignedStudentIds { get ; set ; } // For
  counselors
  12 public Guid ? StudentProfileId { get ; set ; } // For students
  13 public List < Guid > ChildStudentIds { get ; set ; } // For parents
  14 }
  20
  Chapter 5
  EPIC 2: Curriculum & Course
  Trajectory
  5.1 TASK 2.1: Course Catalog Import
  JIRA Reference: SCRUM-136 Priority: HIGH Estimate: 8 hours
  5.1.1 Import Process

1. Download template CSV
2. Fill in course data
3. Upload le
4. System validates and shows preview
5. User conrms import
6. System creates courses, reports errors
   5.1.2 Validation Rules
    Required elds: code, name, category, credits
    Code must be unique within school
    Credits must be positive number
    Grade levels must be 9-12
    Prerequisites must reference existing courses
   5.2 TASK 2.2: AP/IB Course Recognition (AI)
   JIRA Reference: SCRUM-137 Priority: HIGH Estimate: 12 hours
   5.2.1 AI Prompt Example
   21
   CHAPTER 5. EPIC 2: CURRICULUM & COURSE TRAJECTORY Arquitectos del Futuro
   1 Given this course information :
   2 - Name : " Advanced Calculus "
   3 - Description : " Covers limits , derivatives , integrals "
   4 - Category : " Mathematics "
   5
   6 Determine if equivalent to any AP or IB course .
   7
   8 Expected Response :
   9 {
   10 " isAP ": true ,
   11 " apCourse ": " AP Calculus AB " ,
   12 " confidence ": 0.92
   13 }
   5.3 TASK 2.3: Prerequisites Engine
   JIRA Reference: SCRUM-138 Priority: HIGH Estimate: 10 hours
   1 public class PrerequisiteValidator
   2 {
   3 public ValidationResult CanEnroll ( Student student , Course course )
   4 {
   5 var result = new ValidationResult { IsValid = true };
   6
   7 foreach ( var prereqId in course . PrerequisiteIds )
   8 {
   9 if (! student . CompletedCourseIds . Contains ( prereqId ) )
   10 {
   11 var prereq = GetCourse ( prereqId ) ;
   12 result . IsValid = false ;
   13 result . Errors . Add ( $ " Missing : { prereq . Name } " ) ;
   14 }
   15 }
   16
   17 if (! course . GradeLevels . Contains ( student . GradeLevel ) )
   18 {
   19 result . IsValid = false ;
   20 result . Errors . Add ( $ " Not available for grade { student .
   GradeLevel } " ) ;
   21 }
   22
   23 return result ;
   24 }
   25 }
   5.4 TASK 2.4: Course Sequence Builder
   JIRA Reference: SCRUM-139 Priority: HIGH Estimate: 20 hours
   Recommended Library: React Flow (https://reactow.dev/)
   5.4.1 UI Wireframe
   +----------+----------+----------+----------+
   | GRADE 9 | GRADE 10 | GRADE 11 | GRADE 12 |
   22
   CHAPTER 5. EPIC 2: CURRICULUM & COURSE TRAJECTORY Arquitectos del Futuro
   +----------+----------+----------+----------+
   | | | | |
   | [Pre- |-->[Alg I]|-->[AlgII]|-->[PreC] |
   | Algebra]| | | | | | |
   | | v | v | v |
   | [Intro |-->[Bio] | [AP Calc]| [AP Calc]|
   | Bio] | | | | |
   | | v | | |
   | | [Chem]---|-->[AP Chem] |
   +----------+----------+----------+----------+
   Legend: [Course] --> Arrow shows prerequisite
   5.4.2 Data Structure
   1 interface CourseNode {
   2 id : string ;
   3 courseId : string ;
   4 courseName : string ;
   5 gradeLevel : number ;
   6 position : { x : number ; y : number };
   7 status : ' completed ' | ' current ' | ' planned ';
   8 }
   9
   10 interface CourseTrajectory {
   11 studentId : string ;
   12 nodes : CourseNode [];
   13 edges : PrerequisiteEdge [];
   14 }
   5.5 TASK 2.5: Gap Analysis Algorithm
   JIRA Reference: SCRUM-140 Priority: HIGH Estimate: 16 hours
   5.5.1 Gap Types
7. Credit Gap: Not enough credits in a category
8. Course Gap: Missing required courses
9. Pace Gap: Behind schedule for grade level
10. Career Gap: Missing courses for target career
    1 public class GapAnalysisReport
    2 {
    3 public Guid StudentId { get ; set ; }
    4 public string OverallStatus { get ; set ; } // " On Track " , " At Risk "
    5 public decimal OverallProgress { get ; set ; }
    6 public List < Gap > Gaps { get ; set ; }
    7 public List < CourseRecommendation > Recommendations { get ; set ; }
    8 }
    9
    10 public class Gap
    23
    CHAPTER 5. EPIC 2: CURRICULUM & COURSE TRAJECTORY Arquitectos del Futuro
    11 {
    12 public string Type { get ; set ; } // " credit " , " course " , etc .
    13 public string Severity { get ; set ; } // " low " , " medium " , " high "
    14 public string Category { get ; set ; }
    15 public string Description { get ; set ; }
    16 }
    5.6 TASK 2.6: AI Course Recommendations
    JIRA Reference: SCRUM-141 Priority: HIGH Estimate: 16 hours
    5.6.1 AI Input
    1 {
    2 " student " : {
    3 " gradeLevel " : 10 ,
    4 " gpa " : 3.5 ,
    5 " completedCourses " : [ " MATH -101 " , " MATH -201 " ]
    6 } ,
    7 " assessments " : {
    8 " pca " : { " leadership " : 85 , " initiative " : 90 } ,
    9 " careerMatch " : [ " Software Engineering " ]
    10 } ,
    11 " targetCareer " : " Software Engineering "
    12 }
    5.6.2 AI Output
    1 {
    2 " nextSemesterRecommendations " : [
    3 {
    4 " courseId " : " CS -101 " ,
    5 " courseName " : " Intro to CS " ,
    6 " reason " : " Essential for Software Engineering " ,
    7 " priority " : 1
    8 }
    9 ]
    10 }
    24
    Chapter 6
    EPIC 3: Integration Layer
    6.1 TASK 3.1: CSV Grade Import
    JIRA Reference: SCRUM-142 Priority: HIGH Estimate: 12 hours
    6.1.1 CSV Format
    1 student_id , student_email , course_code , semester , grade , credits , status
    2 STU001 , john@school . edu , MATH -301 , Fall 2025 , A ,1.0 , completed
    3 STU002 , jane@school . edu , MATH -301 , Fall 2025 , A - ,1.0 , completed
    6.1.2 Validation
    1 public class GradeImportValidator
    2 {
    3 private readonly string [] ValidGrades =
    4 { " A + " , " A " , "A - " , " B + " , " B " , "B - " , " C + " , " C " , "C - " ,
    5 " D + " , " D " , "D - " , " F " , " P " , " NP " , " I " , " W " };
    6
    7 public ValidationResult Validate ( GradeImportRow row )
    8 {
    9 var errors = new List < string >() ;
    10
    11 if ( string . IsNullOrEmpty ( row . StudentEmail ) )
    12 errors . Add ( " Student email is required " ) ;
    13
    14 if (! ValidGrades . Contains ( row . Grade . ToUpper () ) )
    15 errors . Add ( $ " Invalid grade : { row . Grade } " ) ;
    16
    17 return new ValidationResult {
    18 IsValid = ! errors . Any () , Errors = errors
    19 };
    20 }
    21 }
    6.2 TASK 3.2: Data Mapping Engine
    JIRA Reference: SCRUM-143 Priority: MEDIUM Estimate: 8 hours
    1 {
    2 " schoolId " : " ... " ,
    25
    CHAPTER 6. EPIC 3: INTEGRATION LAYER Arquitectos del Futuro
    3 " mappings " : [
    4 { " externalCode " : " MTH301 " , " internalCourseId " : " guid - algebra -2 " } ,
    5 { " externalCode " : " SCI201 " , " internalCourseId " : " guid - chemistry " }
    6 ]
    7 }
    26
    Chapter 7
    EPIC 4: Assessment System
    7.1 TASK 4.1: Assessment Conguration
    JIRA Reference: SCRUM-144 Priority: HIGH Estimate: 8 hours
    1 public class AssessmentConfig
    2 {
    3 public Guid SchoolId { get ; set ; }
    4 public string AssessmentType { get ; set ; } // " PCA " , "
    FluidIntelligence "
    5
    6 // Scheduling
    7 public bool UseFixedSchedule { get ; set ; }
    8 public DateTime ? ScheduledDate { get ; set ; }
    9 public int TimeWindowDays { get ; set ; }
    10
    11 // Proctoring
    12 public bool RequireProctoring { get ; set ; }
    13 public string ProctoringType { get ; set ; } // " in - person " , " virtual
    "
    14
    15 // Time Limits
    16 public int TimeLimitMinutes { get ; set ; }
    17 public bool AllowPause { get ; set ; }
    18
    19 // Retakes
    20 public int MaxAttempts { get ; set ; }
    21 public int CooldownDays { get ; set ; }
    22 }
    7.2 TASK 4.2: 360-Degree Evaluation Invites
    JIRA Reference: SCRUM-145 Priority: HIGH Estimate: 8 hours
    7.2.1 Flow
11. Counselor initiates evaluation for student
12. System sends email to parents with unique link
13. System sends email to selected teachers
14. Parents/teachers complete evaluation (5-10 min)
    27
    CHAPTER 7. EPIC 4: ASSESSMENT SYSTEM Arquitectos del Futuro
15. System aggregates responses
    1 public class Evaluation360
    2 {
    3 public Guid Id { get ; set ; }
    4 public Guid StudentId { get ; set ; }
    5 public Guid InitiatedBy { get ; set ; }
    6 public DateTime Deadline { get ; set ; }
    7 public string Status { get ; set ; } // " pending " , " complete "
    8 public List < Evaluation360Invite > Invites { get ; set ; }
    9 }
    10
    11 public class Evaluation360Invite
    12 {
    13 public Guid Id { get ; set ; }
    14 public string Email { get ; set ; }
    15 public string EvaluatorType { get ; set ; } // " parent " , " teacher "
    16 public string UniqueToken { get ; set ; }
    17 public DateTime ? CompletedAt { get ; set ; }
    18 }
    28
    Chapter 8
    EPIC 5: Counselor Dashboard
    8.1 TASK 5.1: Student List View
    JIRA Reference: SCRUM-146 Priority: HIGH Estimate: 8 hours
    +------------------------------------------------------------------+
    | MY STUDENTS [Search...] [Filters v] |
    +------------------------------------------------------------------+
    | NAME | GRADE | STATUS | PROGRESS | ASSESS | ACT |
    +------------------------------------------------------------------+
    | Maria Lopez | 11 | On Track | 78% | 4/4 | [View]|
    | Carlos Perez | 10 | At Risk | 52% | 2/4 | [View]|
    | Ana Martinez | 12 | On Track | 95% | 4/4 | [View]|
    | Juan Rodriguez | 9 | Behind | 25% | 0/4 | [View]|
    +------------------------------------------------------------------+
    8.2 TASK 5.2: Alert System
    JIRA Reference: SCRUM-147 Priority: HIGH Estimate: 12 hours
    8.2.1 Alert Types
    Alert Trigger Severity
    Grade Drop GPA drops more than 0.5 High
    Missing Assessment
    Deadline passed Medium
    Credit Gap Behind expected credits High
    No Career Path Senior without path High
    Inactive No login in 30+ days Low
    1 public class Alert
    2 {
    3 public Guid Id { get ; set ; }
    4 public Guid StudentId { get ; set ; }
    5 public string Type { get ; set ; }
    6 public string Severity { get ; set ; } // " low " , " medium " , " high "
    7 public string Title { get ; set ; }
    8 public string Description { get ; set ; }
    9 public bool IsRead { get ; set ; }
    10 public bool IsDismissed { get ; set ; }
    11 }
    29
    Chapter 9
    EPIC 6: Student Portal
    9.1 TASK 6.1: CV/Resume Generator
    JIRA Reference: SCRUM-148 Priority: MEDIUM Estimate: 12 hours
    9.1.1 Data Sources for CV
     Personal info (name, contact)
     Education (school, GPA, graduation date)
     Courses and achievements (AP scores, honors)
     Assessment highlights (top competencies from PCA)
     Extracurricular activities
     Skills (derived from courses and assessments)
     Awards and certications
    9.1.2 Implementation
    Use QuestPDF (C#) or Puppeteer for HTML-to-PDF generation.
    9.2 TASK 6.2: University Suggestions (AI)
    JIRA Reference: SCRUM-149 Priority: MEDIUM Estimate: 12 hours
    9.2.1 Matching Criteria
     Academic t (GPA vs. admission requirements)
     Career alignment (programs vs. goals)
     Location preferences
     Financial considerations
     Competency match
    30
    Chapter 10
    JIRA Task Reference
    All tasks created in SCRUM project (Sprint 0):
    Key Summary Priority Est.
    SCRUM-129 Request updated GitHub repo from TIMS BLOCKER0h
    SCRUM-130 School Prole Setup (CRUD) HIGH 4h
    SCRUM-131 Curriculum Framework Conguration HIGH 8h
    SCRUM-132 Course/Subject Management CRUD HIGH 8h
    SCRUM-133 Graduation Rules Engine HIGH 12h
    SCRUM-134 Academic Calendar Setup MEDIUM 6h
    SCRUM-135 User Role Management HIGH 8h
    SCRUM-136 Course Catalog Import (CSV) HIGH 8h
    SCRUM-137 AP/IB Course Recognition (AI) HIGH 12h
    SCRUM-138 Prerequisites Engine HIGH 10h
    SCRUM-139 Course Sequence Builder (Flowchart) HIGH 20h
    SCRUM-140 Gap Analysis Algorithm HIGH 16h
    SCRUM-141 AI Course Recommendations HIGH 16h
    SCRUM-142 CSV Grade Import from iSAMS HIGH 12h
    SCRUM-143 Data Mapping Engine MEDIUM 8h
    SCRUM-144 Assessment Conguration HIGH 8h
    SCRUM-145 360-Degree Evaluation Invites HIGH 8h
    SCRUM-146 Counselor Student List View HIGH 8h
    SCRUM-147 Alert System HIGH 12h
    SCRUM-148 CV/Resume Generator MEDIUM 12h
    SCRUM-149 University Suggestions (AI) MEDIUM 12h
    SCRUM-150 Document existing database schema HIGH 4h
    SCRUM-151 Create basic alert infrastructure HIGH 8h
    Total Estimated Hours: 208h
    31
    Chapter 11
    Testing Strategy
    11.1 Test Coverage Requirements
     Unit Tests: Each service should have more than 80% coverage
     Integration Tests: Test API endpoints with test database
     E2E Tests: Critical ows (school setup, enrollment, assessments)
     UAT: CDS counselors test with real workows
     Performance: Ensure less than 2 second response times
    11.2 Critical Test Scenarios
16. School creation and tenant isolation
17. Student invitation and registration ow
18. Course import with validation errors
19. Prerequisite enforcement
20. Graduation progress calculation
21. Assessment completion and scoring
22. 360-degree evaluation aggregation
23. AI recommendation generation
    32
    Chapter 12
    Open Questions for TIMS Team
24. Current database schema documentation?
25. Existing API documentation?
26. Authentication system (JWT, OAuth, etc.)?
27. Deployment environment (Azure, AWS)?
28. Existing AI/ML models - architecture and training data?
29. Current frontend technology (React, Angular, Blazor)?
30. CI/CD pipeline setup?
    33
    Chapter 13
    CDS Meeting Summary
    From February 6, 2026 meeting:
    Attendees: Rectoria, College Counseling team, IT department
    Key Requirements:
     Bilingual support (Spanish primary, English secondary)
     Must integrate with existing iSAMS system
     Track students from 9th grade through graduation
     AI for career recommendations
     Parent portal access
     Support AP and IB curriculum tracking
     CV generation for university applications
     Extracurricular activity tracking
    Technical Constraints:
     iSAMS API access requires vendor approval
     CSV export available as interim solution
     Student data must remain within school tenant
     Compliance with Costa Rica data protection laws
    34
    Chapter 14
    Glossary
    PCA Professional Competencies Assessment - evaluates 12 core competencies
    Fluid Intelligence Abstract reasoning capability
    360-Degree Evaluation Multi-perspective assessment
    AP Advanced Placement - US College Board curriculum
    IB International Baccalaureate - global standard
    iSAMS Student Information Management System
    MEP Ministerio de Educacion Publica (Costa Rica)
    Tenant Isolated instance for each school
    Gap Analysis Comparison of progress vs. requirements
    35
