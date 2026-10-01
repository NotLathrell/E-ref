"""Deliver password-reset codes by email.

Set EREF_SMTP_HOST (plus EREF_SMTP_PORT, EREF_SMTP_USER, EREF_SMTP_PASSWORD and
EREF_SMTP_FROM) to send real email. Without them the code is written to the server
log, which is enough to demonstrate the flow on a local network.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

log = logging.getLogger("eref.mailer")


def smtp_configured() -> bool:
    return bool(os.getenv("EREF_SMTP_HOST"))


def send_reset_code(email: str, code: str) -> bool:
    """True if the code was emailed, False if it only went to the server log."""
    if not smtp_configured():
        log.warning("Password reset code for %s: %s (SMTP not configured, not emailed)", email, code)
        return False

    message = EmailMessage()
    message["Subject"] = "Your E-REF password reset code"
    message["From"] = os.getenv("EREF_SMTP_FROM", os.getenv("EREF_SMTP_USER", "no-reply@eref.local"))
    message["To"] = email
    message.set_content(
        f"Your E-REF verification code is {code}.\n"
        "It expires in 15 minutes. If you did not ask to reset your password, ignore this email."
    )

    host = os.environ["EREF_SMTP_HOST"]
    port = int(os.getenv("EREF_SMTP_PORT", "587"))
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=15) as smtp:
                _login_and_send(smtp, message)
        else:
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                _login_and_send(smtp, message)
    except (OSError, smtplib.SMTPException):
        log.exception("Could not email the reset code to %s", email)
        log.warning("Password reset code for %s: %s (email failed)", email, code)
        return False
    return True


def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    user = os.getenv("EREF_SMTP_USER")
    if user:
        smtp.login(user, os.getenv("EREF_SMTP_PASSWORD", ""))
    smtp.send_message(message)
