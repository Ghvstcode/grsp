import smtplib
from email.message import EmailMessage

from django.conf import settings


class MailerError(Exception):
    pass


def send(to, email):
    message = EmailMessage()
    message["To"] = to
    message["From"] = settings.MAIL_FROM
    message["Subject"] = email["subject"]
    message.set_content(email["body"])
    try:
        with smtplib.SMTP(settings.SMTP_HOST) as smtp:
            smtp.send_message(message)
    except smtplib.SMTPException as err:
        raise MailerError(str(err)) from err
