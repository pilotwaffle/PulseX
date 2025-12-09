import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { jwtService } from '../utils/jwt';
import { validateRequest, UserRegistration, UserLogin } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest, logout } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class AuthController {
  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const validatedData = validateRequest(UserRegistration, req.body);

    // Validate password strength
    const passwordValidation = await require('../utils/password').passwordService.validatePasswordStrength(validatedData.password);
    if (!passwordValidation.isValid) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'PASSWORD_TOO_WEAK',
          message: 'Password does not meet security requirements',
          details: { errors: passwordValidation.errors },
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const { user, tokens } = await userService.createUser({
      email: validatedData.email,
      password: validatedData.password,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phoneNumber: validatedData.phoneNumber,
    });

    const response: APIResponse = {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          avatarUrl: user.avatar_url,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
        tokens,
      },
      requestId,
    };

    res.status(201).json(response);
  });

  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const validatedData = validateRequest(UserLogin, req.body);

    const { user, tokens } = await userService.authenticateUser(
      validatedData.email,
      validatedData.password
    );

    const response: APIResponse = {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          avatarUrl: user.avatar_url,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
        tokens,
      },
      requestId,
    };

    res.json(response);
  });

  refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const { refreshToken } = req.body;

    if (!refreshToken) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token is required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    try {
      const tokens = jwtService.refreshToken(refreshToken);

      const response: APIResponse = {
        success: true,
        data: { tokens },
        requestId,
      };

      res.json(response);
    } catch (error) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'REFRESH_TOKEN_INVALID',
          message: error instanceof Error ? error.message : 'Invalid refresh token',
        },
        requestId,
      };
      res.status(401).json(response);
    }
  });

  logout = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await logout(req, res);
  });

  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const user = await userService.getUserById(req.user.id);

    if (!user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          avatarUrl: user.avatar_url,
          isActive: user.is_active,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      },
      requestId,
    };

    res.json(response);
  });

  updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const { firstName, lastName, phoneNumber, avatarUrl } = req.body;

    const updatedUser = await userService.updateUser(req.user.id, {
      firstName,
      lastName,
      phoneNumber,
      avatarUrl,
    });

    const response: APIResponse = {
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          phoneNumber: updatedUser.phone_number,
          avatarUrl: updatedUser.avatar_url,
          isActive: updatedUser.is_active,
          createdAt: updatedUser.created_at,
          updatedAt: updatedUser.updated_at,
        },
      },
      requestId,
    };

    res.json(response);
  });

  deactivateAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    await userService.deactivateUser(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { message: 'Account deactivated successfully' },
      requestId,
    };

    res.json(response);
  });
}

export const authController = new AuthController();