# Constraint Validation System

This document describes the constraint validation system implemented for the Agendo scheduling application.

## Overview

The constraint validation system ensures that schedules comply with business rules and operational constraints. It validates schedules against hard rules and provides detailed feedback on violations and suggestions for improvement.

## Architecture

### Core Components

1. **ConstraintEngineService** (`src/services/constraintEngineService.js`)

   - Main validation logic
   - Validates against all constraint types
   - Returns detailed violation reports and metrics

2. **ConstraintController** (`src/controllers/constraintController.js`)

   - API endpoints for constraint validation
   - Handles HTTP requests and responses
   - Manages data fetching and validation orchestration

3. **ConstraintRouter** (`src/routers/constraintRouter.js`)
   - Express router configuration
   - Swagger documentation
   - Route definitions and middleware

## Validation Rules

### 1. Availability Constraints

- **Work Hours**: Shifts must fall within user's defined work hours
- **Google Calendar Conflicts**: Checks for existing GCal events that overlap with shifts
- **Time Zone Handling**: Properly handles user timezones

### 2. Skills Matching

- **Required Skills**: Users must have all skills required by the position
- **Skill Validation**: Cross-references user skills with position requirements

### 3. Time Limits

- **Daily Limits**: Enforces maximum daily work hours per user
- **Weekly Limits**: Enforces maximum weekly work hours per user
- **Overtime Prevention**: Prevents excessive scheduling

### 4. Activity Rules

- **Minimum Time**: Shifts must meet minimum duration requirements
- **Maximum Time**: Shifts cannot exceed maximum duration limits
- **Break Requirements**: Enforces breaks after stress activities

### 5. Conflict Prevention

- **Double Booking**: Prevents users from being scheduled for overlapping shifts
- **Time Overlap Detection**: Identifies and reports scheduling conflicts

### 6. Coverage Analysis

- **Demand Matching**: Compares scheduled staff against forecasted demand
- **Undercoverage Detection**: Identifies periods with insufficient staffing
- **Activity-Specific Coverage**: Validates coverage for specific activity types

## API Endpoints

### POST /api/constraints/validate

Validates a complete schedule against all constraints.

**Request Body:**

```json
{
  "shifts": [
    {
      "userId": "user_id",
      "positionId": "position_id",
      "startTime": "2024-01-15T09:00:00Z",
      "endTime": "2024-01-15T17:00:00Z"
    }
  ],
  "dateRange": {
    "start": "2024-01-15T00:00:00Z",
    "end": "2024-01-15T23:59:59Z"
  }
}
```

**Response:**

```json
{
  "ok": false,
  "violations": [
    {
      "type": "AVAILABILITY",
      "message": "Shift outside work hours",
      "data": { "shift": {...} },
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "metrics": {
    "totalShifts": 5,
    "totalUsers": 3,
    "totalPositions": 2,
    "coverageScore": 85.5,
    "skillMatchScore": 100.0,
    "availabilityScore": 80.0
  },
  "suggestions": [
    {
      "type": "AVAILABILITY",
      "message": "Consider adjusting work hours or checking Google Calendar conflicts",
      "count": 2
    }
  ]
}
```

### POST /api/constraints/validate-shift

Validates a single shift against constraints.

**Request Body:**

```json
{
  "shift": {
    "startTime": "2024-01-15T09:00:00Z",
    "endTime": "2024-01-15T17:00:00Z"
  },
  "userId": "user_id",
  "positionId": "position_id"
}
```

### GET /api/constraints/metrics

Gets constraint validation metrics for a date range.

**Query Parameters:**

- `start`: Start date (YYYY-MM-DD)
- `end`: End date (YYYY-MM-DD)

### GET /api/constraints/available-users

Gets users available for a specific time slot and position.

**Query Parameters:**

- `start`: Start time (ISO 8601)
- `end`: End time (ISO 8601)
- `positionId`: Position ID

## Usage Examples

### Backend Usage

```javascript
import constraintEngine from "../services/constraintEngineService.js";

// Validate a schedule
const result = await constraintEngine.validateSchedule({
  shifts: shiftArray,
  users: userArray,
  positions: positionArray,
  forecasts: forecastArray,
  dateRange: { start: startDate, end: endDate },
});

if (result.ok) {
  console.log("Schedule is valid!");
} else {
  console.log(`Found ${result.violations.length} violations`);
  result.violations.forEach((violation) => {
    console.log(`${violation.type}: ${violation.message}`);
  });
}
```

### Frontend Usage

```typescript
import { useConstraintValidation } from "../hooks/useConstraintValidation";

const MyComponent = () => {
  const { validateSchedule, validationResult, isValidating } =
    useConstraintValidation();

  const handleValidate = async () => {
    const result = await validateSchedule(shifts, dateRange);
    if (result?.ok) {
      // Proceed with schedule creation
    }
  };

  return (
    <div>
      <Button onClick={handleValidate} disabled={isValidating}>
        Validate Schedule
      </Button>
      {validationResult && (
        <div>{validationResult.ok ? "Valid!" : "Invalid!"}</div>
      )}
    </div>
  );
};
```

## Integration with Existing Systems

### Google Calendar Integration

- Uses existing `gCalendarService.getUserEventsForDate()` method
- Checks for conflicts with existing calendar events
- Handles timezone conversions properly

### Database Integration

- Leverages existing User, Position, Shift, and DemandForecast models
- Uses populated references for skills and requirements
- Maintains data consistency with existing schemas

### Frontend Integration

- Provides React hooks for easy integration
- Includes reusable UI components
- Supports real-time validation feedback

## Performance Considerations

### Optimization Strategies

- **Batch Validation**: Validates multiple shifts in single operation
- **Efficient Queries**: Uses populated references to minimize database calls
- **Caching**: Can be extended with Redis caching for frequently accessed data
- **Async Operations**: Non-blocking validation for better user experience

### Scalability

- **Horizontal Scaling**: Stateless service can be scaled horizontally
- **Database Optimization**: Uses indexed queries for better performance
- **Memory Management**: Efficient data structures and cleanup

## Error Handling

### Validation Errors

- **Graceful Degradation**: Continues validation even if some checks fail
- **Detailed Error Messages**: Provides specific information about violations
- **Error Categorization**: Groups errors by type for better user experience

### System Errors

- **Logging**: Comprehensive error logging for debugging
- **Fallback Behavior**: Safe defaults when external services are unavailable
- **User Feedback**: Clear error messages for users

## Testing

### Unit Tests

- Test individual constraint validation functions
- Mock external dependencies (GCal, database)
- Verify error handling and edge cases

### Integration Tests

- Test complete validation workflows
- Verify API endpoint functionality
- Test with real data scenarios

### Performance Tests

- Load testing with large datasets
- Memory usage profiling
- Response time optimization

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**: Learn from historical validation patterns
2. **Advanced Optimization**: Integration with OR-Tools for schedule optimization
3. **Real-time Validation**: WebSocket-based live validation
4. **Custom Rules Engine**: User-defined validation rules
5. **Analytics Dashboard**: Comprehensive validation metrics and reporting

### Configuration Options

- **Configurable Rules**: Make validation rules configurable
- **Rule Priorities**: Allow different priority levels for rules
- **Custom Metrics**: Support for custom validation metrics
- **Rule Templates**: Predefined rule sets for different scenarios

## Troubleshooting

### Common Issues

1. **GCal Integration Failures**

   - Check user authentication tokens
   - Verify API permissions
   - Handle rate limiting gracefully

2. **Database Connection Issues**

   - Ensure proper connection pooling
   - Handle connection timeouts
   - Implement retry logic

3. **Performance Issues**
   - Monitor query performance
   - Optimize data fetching
   - Consider caching strategies

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG_CONSTRAINTS=true
```

This will provide detailed logging of validation steps and decision points.

## Contributing

### Code Style

- Follow existing code patterns
- Use JSDoc for documentation
- Include comprehensive error handling
- Write unit tests for new features

### Adding New Constraints

1. Add validation logic to `ConstraintEngineService`
2. Update API documentation
3. Add frontend support if needed
4. Write tests for new constraint
5. Update this documentation

### Performance Guidelines

- Profile new validation rules
- Consider impact on large datasets
- Optimize database queries
- Test with realistic data volumes
