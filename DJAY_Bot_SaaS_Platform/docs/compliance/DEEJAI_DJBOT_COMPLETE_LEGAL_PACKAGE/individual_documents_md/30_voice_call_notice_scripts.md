# Voice Call Notice and Consent Scripts

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Inbound, no recording

"Hello, you have reached the Merchant identified in the call configuration. This call is handled by an automated voice assistant provided through DJBOT. The assistant may create a text transcript to answer your request. The call is not recorded. Please do not provide passwords, one-time codes or full card details. Say 'human' at any time to request a person."

## 2. Inbound, recording after approval

"Hello, you have reached the Merchant identified in the call configuration. This call is handled by an automated voice assistant through DJBOT. With your permission, this call will be recorded and transcribed for handling your request and the purposes in the privacy notice. Say 'I agree' to continue with recording, or 'no recording' to continue without recording where available. Say 'human' for a person."

## 3. Outbound service

"Hello, this is the automated voice assistant of the Merchant identified in the call configuration calling about your request. This is not an emergency service. The call may be transcribed. Say 'human' for a person or 'stop' to end."

## 4. Outbound marketing

"Hello, this is the automated voice assistant of the Merchant identified in the call configuration. You previously agreed to receive this type of call. Say 'stop marketing' at any time to join the do-not-call list. This call is automated."

## 5. Thai inbound, no recording

"สวัสดีค่ะ/ครับ ท่านกำลังติดต่อ ร้านค้าที่ระบุไว้ในการตั้งค่าการโทร สายนี้ให้บริการโดยผู้ช่วยเสียงอัตโนมัติผ่าน DJBOT ระบบอาจสร้างข้อความถอดเสียงเพื่อดำเนินการตามคำขอของท่าน แต่จะไม่บันทึกเสียง กรุณาอย่าแจ้งรหัสผ่าน รหัส OTP หรือข้อมูลบัตรชำระเงินเต็มรูปแบบ หากต้องการติดต่อเจ้าหน้าที่ กรุณาพูดว่า 'เจ้าหน้าที่'"

## 6. Rules

Recording stays disabled until provider, consent, retention and legal approval are active. Refusal is honoured. Merchant maintains lawful basis, hours and do-not-call list. Emergency/professional decisions require human transfer.
