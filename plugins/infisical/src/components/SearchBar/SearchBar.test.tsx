/**
 * Tests for SearchBar component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
    const mockOnSearchChange = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders correctly with empty search text', () => {
        render(
            <SearchBar
                searchText=""
                onSearchChange={mockOnSearchChange}
            />
        );

        expect(screen.getByPlaceholderText('Filter')).toBeInTheDocument();
        // Clear icon should not be visible when search text is empty
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders correctly with search text', () => {
        render(
            <SearchBar
                searchText="api"
                onSearchChange={mockOnSearchChange}
            />
        );

        const inputElement = screen.getByPlaceholderText('Filter');
        expect(inputElement).toBeInTheDocument();
        expect(inputElement).toHaveValue('api');

        // Clear icon should be visible when search text is not empty
        expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('calls onSearchChange when input value changes', () => {
        render(
            <SearchBar
                searchText=""
                onSearchChange={mockOnSearchChange}
            />
        );

        const inputElement = screen.getByPlaceholderText('Filter');
        fireEvent.change(inputElement, { target: { value: 'test' } });

        expect(mockOnSearchChange).toHaveBeenCalledWith('test');
    });

    it('clears search text when clear button is clicked', () => {
        render(
            <SearchBar
                searchText="api"
                onSearchChange={mockOnSearchChange}
            />
        );

        const clearButton = screen.getByRole('button');
        fireEvent.click(clearButton);

        expect(mockOnSearchChange).toHaveBeenCalledWith('');
    });
});