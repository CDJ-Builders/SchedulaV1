**Part A \- Project Overview**

1. Project Title  
   The title of the project is “Schedula: Build Your Daily Blocks”.

2. Brief Description of the Project  
   Schedula is a web-based scheduling application that helps teams find shared availability and coordinate meetings through smart schedule analysis and customizable visualization. Its main feature is its ability to suggest optimal schedule meetings for a team that fits within the members’ individual schedules.  
     
3. What problem does the project solve?  
   Schedula solves the hassle of scheduling meetings and confirming that all of its participants are able to join, as well as allows individual participants to find optimal time slots for schedules. The elimination of this hassle allows the time that would be spent preparing the meeting to be allotted to other tasks.  
     
4. Who are the intended users?  
   Schedula is intended for projects that require collaboration. As such, it can be used by students and professional teams alike to find optimal meeting times that can fit into their individual schedules.  
     
5. Why is the system needed?  
   This system is needed as it streamlines an important part of collaboration, which is the ability to set aside time to meet and share information. This is especially valuable as collaboration is the foundation of all businesses and organizations.  
     
6. What may happen if the system is not developed?  
   If the system is not developed, potential end users will have no choice but to continue to be inconvenienced when preparing meetings, as it takes a considerable amount of time.

**Part B \- Stakeholder Identification**

| Stakeholder | Role in the System | Needs/Expectations |
| ----- | ----- | ----- |
| Students | End User | Schedula allows students to find optimal time slots for group projects. |
| Professionals | End User | Schedula allows professionals to find optimal time slots to meet and collaborate. |
| Developers | System Manager/System Maintainer | If the project becomes a full-fledged commercial application, a developer team will manage and maintain the system. |
| Future Third-Party Researchers and Developers | Beneficiary  | Future researchers and developers will be able to use the system for reference or for research into similar applications. |

**Part C \- Feature Brainstorming**  
	**Smart Scheduling**

1. Users can input their existing schedule and availability.  
2. Users can set preferred and avoided time blocks for scheduling.  
3. Users experience automatic conflict detection when scheduling tasks.  
4. Users can see the most optimal time blocks for task scheduling.  
5. User decisions are learned so that it predicts more accurate optimal schedules.  
   **Schedule Management**  
6. Users can manage their personal schedule separately.  
7. Users can create and manage group schedules for proper coordination.  
8. Users can see personal and team schedules combined in a specific interface.  
9. Users can create and manage schedule templates for easier reuse.  
   **Schedule Visualization**  
10. Users can see a clean calendar view of their commitments.  
11. Users can import their schedules from text or paper.  
12. Users can export their schedule as a PNG/PDF.  
13. Users can copy their schedule links to share with others within the system.  
14. Users can customize the visual layout of the schedule to suit their preferences.  
    **Chat Scheduling Assistant**  
15. Users have a scheduling assistant that makes scheduling suggestions and actions.  
16. Users have a scheduling assistant that learns from their decisions over time.  
17. Users have a scheduling assistant that proposes meeting times and deadlines.  
    **Authentication \+ Credential Management**  
18. Users can create an account to save their schedules.  
19. Users can log-in securely to access saved schedules.  
20. User passwords have appropriate encryption.  
21. Users can control what data is collected.  
    **Authorization**  
22. Users can have only-me access to their personal schedules.  
23. Users can grant flexible access to members in group schedules.  
24. Developers have elevated access to maintain application health.  
    **Smart Deadlines \+ Streak System**  
25. Users can have smart personal deadlines to work on before the actual deadline.  
26. Users receive reminders before set deadlines.  
27. Users receive meeting reminders.  
28. Users can see their consistency streak in meeting deadlines.  
29. Users can see consistency leaderboards for performance monitoring.  
    **UI/UX**  
30. Users can see smooth and responsive animations or transitions.  
31. Users have a web interface that works on mobile, tablet, and desktop.

**Part D \- Requirement Classification** 

| Requirement | Classification | Justification |
| ----- | :---: | ----- |
| Users can create an account to save their schedules | **Functional** | The system should be able to handle user registration. |
| Users experience automatic conflict detection when scheduling tasks | **Functional** | The system should be able to flag conflicts based on overlapping time blocks of users. |
| Users can set preferred and avoided time blocks | **Functional** | The system should be able to receive user input and use use it for the scheduler |
| Users can create and manage group schedules | **Functional** | The system should be able to create, edit, and delete group schedules from user operations. |
| Users can export their schedules as a PNG/PDF | **Functional** | The system should be able to create file outputs based on user schedule inputs. |
| Users receive reminders before set deadlines | **Functional** | The system should be able to create notifications based on conditions from users. |
| Users can have only-me access to their personal schedules. | **Functional** | The system should be able to enforce access control according to the user. |
| User passwords have appropriate encryption. | **Non-Functional** | The system meets appropriate security standards without user interaction. |
| Users have a web interface that works on mobile, tablet, and desktop. | **Non-Functional** | The system meets compatibility and usability standards. |
| Users can see smooth and responsive animations or transitions. | **Non-Functional** | The system meets appropriate interface and experience standards. |

**Part F \- User Requirement Drafting**

- The system should allow students to plot their courses and make their schedules.  
- The system should allow teachers to list their office hours  
  The system should be usable in a scenario outside of an academic setting.  
- The system should allow for exports with multiple file types  
- The system should allow for users to share their schedules with each other  
- The system should be able to plot common hours with shared schedules with preference and availability detection  
- The system should allow for the creation of team schedules  
- The system should allow for any user to customize the design and information contained on their schedule  
- The system should have roles-based access control.   
- The system should have smart deadlines and reminders implemented to assist users