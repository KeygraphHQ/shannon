<!-- BEGIN:COMMON -->
**IF you are not already logged in when you open playwright, these are the login instructions** 
**NOTE: playwright automatically saves sessions so ensure you are not already logged in before executing these steps**

<user_provided_configuration>
{{user_instructions}}
</user_provided_configuration>

<authentication_execution>
Execute the login flow based on the login_type specified in the configuration:
<!-- END:COMMON -->

<!-- BEGIN:FORM -->
**Form-based authentication:**
1. Navigate to the specified login_url using Playwright
2. Execute each step in the login_flow array sequentially:
   - Replace $username with the provided username credential
   - Replace $password with the provided password credential
   - Replace $totp with generated code using the `generate_totp` MCP tool with the TOTP secret: {{totp_secret}}
   - Perform the specified actions (type text, click buttons, etc.)
3. Wait for page navigation/loading to complete after each critical step
4. Handle any consent dialogs or "Continue as [user]" prompts by clicking appropriate buttons
<!-- END:FORM -->

<!-- BEGIN:SSO -->
**SSO authentication:**
1. Navigate to the specified login_url using Playwright
2. Execute each step in the login_flow array sequentially:
   - Click the SSO provider button (e.g., "Sign in with Google")
   - Handle account selection if prompted
   - Replace $username with the provided username credential in provider login
   - Replace $password with the provided password credential in provider login
   - Replace $totp with generated code using the `generate_totp` MCP tool with the TOTP secret: {{totp_secret}}
   - Handle OAuth consent screens by clicking "Allow", "Accept", or "Continue", and hitting check boxes as needed.
   - Handle "Continue as [username]" dialogs by clicking "Continue"
3. Wait for OAuth callback and final redirect to complete
4. Ensure all consent and authorization steps are explicitly handled
<!-- END:SSO -->

<!-- BEGIN:VERIFICATION -->
</authentication_execution>

<success_verification>
After completing the login flow, verify successful authentication:

1. **Check Success Condition:**
   - IF success_condition.type == "url_contains": Verify current URL contains the specified value
   - IF success_condition.type == "url_equals_exactly": Verify current URL exactly matches the specified value
   - IF success_condition.type == "element_present": Verify the specified element exists on the page

2. **Confirm Authentication State:**
   - Page should NOT be on a login screen
   - Page should NOT show authentication errors
   - Page should display authenticated user content/interface

3. **Verification Success:** 
   - Login is successful - proceed with your primary task
   - You now have an authenticated browser session to work with

4. **Verification Failure:**
   - Retry the entire login flow ONCE with 5-second wait between attempts
   - If second attempt fails, report authentication failure and stop task execution
   - Do NOT proceed with authenticated actions if login verification fails

</success_verification>

<error_handling>
If login execution fails:
1. Log the specific step that failed and any error messages
2. Check for unexpected dialogs, pop-ups, or consent screens that may need handling
3. Retry the complete login flow once after a 5-second delay
4. If retry fails, report login failure and halt task execution
5. Do NOT attempt to proceed with the primary task if authentication is unsuccessful

Common issues to watch for:
- OAuth consent screens requiring explicit "Allow" or "Accept" clicks
- "Continue as [user]" or account selection prompts
- TOTP/2FA code timing issues requiring regeneration
- Page loading delays requiring explicit waits
- Redirect handling for multi-step authentication flows
</error_handling>
<!-- END:VERIFICATION -->