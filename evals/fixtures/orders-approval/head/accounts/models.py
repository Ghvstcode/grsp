from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class RoleManager(UserManager):
    def with_role(self, role):
        return self.filter(roles__name=role, is_active=True)


class Role(models.Model):
    name = models.CharField(max_length=64, unique=True)


class User(AbstractUser):
    roles = models.ManyToManyField(Role)

    objects = RoleManager()

    def has_role(self, role):
        return self.roles.filter(name=role).exists()
